import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";


const generateAccessAndRefreshTokens = async(userId)=>{
    try{
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}

    } catch(error){
        throw new ApiError(500, "Something went wrong while generating refresh and access TokenExpiredError.....")
    }
}

//User registration
const registerUser = asyncHandler(async(req,res)=>{
    //1.get user details from frontend
    const {fullname, email, username, password} = req.body
    // console.log("email:", email);

    //2.validation - not empty  
    if(
        [fullname, email, username, password].some((field)=>field?.trim()==="")
    ){
        throw new ApiError(400, "All fields are required");
    }

    //3.check if user already exists: username, email
    
    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })
    if(existedUser){
        throw new ApiError(409, "User with email or username already exists");
    }

    //4.check for images, check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }


    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required");
    }

    //5.upload them to cloudinary, avatar
    const avatar = await  uploadOnCloudinary(avatarLocalPath);
    const coverImage = await  uploadOnCloudinary(coverImageLocalPath);
    
    if(!avatar){
        throw new ApiError(400,"Avatar is required");
    }

    // 6.create user object - create entry in db
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
    
    // 7.remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    // 8.check for user creation
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while User Registration!")
    }

    // 9.return response
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Successfully!")
    )

})

//User login
const loginUser = asyncHandler(async (req, res)=>{
    const {email, username, password} = req.body;

    if(!username && !email){
        throw new ApiError(400, "Username or Email is required!")
    }
    
    const user = await User.findOne({
        $or: [{username},{email}]
    })
    
    if(!user){
        throw new ApiError(404, "User does not exists!")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials!")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);
    
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    
    const options = {
        httpOnly :  true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully!"
        )
    )
})

//User logout
const logoutUser = asyncHandler(async (req, res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly :  true,
        secure: true
    }
    
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"))
})

//Refresh Token Endpoint
const refreshAccessToken = asyncHandler(async (req, res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request!")
    }

    try {
            const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

            const user = await User.findById(decodedToken?._id)
            if(!user){
                throw new ApiError(401, "Invalid refresh token")
            }
        
            if(incomingRefreshToken != user?.refreshToken){
                throw new ApiError(401, "Refresh token is expired")
            }
        
            const options = {
                httpOnly: true,
                secure: true
            }
        
            const {accessToken, newrefreshToken} = await generateAccessAndRefreshTokens(user._id)
        
            return res
            .status(200)
            .cookie("accessToken", newaccessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {accessToken, refreshToken: newrefreshToken},
                    "Access token refreshed"
                )
            )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false});
    
    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password Changes"))
})

const getCurrentUser = asyncHandler(async(req, res)=>{
    return res
    .status(200)
    .json(200,req.user, "Current user fectched")
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName, email}  = req.body

    if(!fullName || !email){
        throw new ApiError(400, "All fields are required")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName:fullName,
                email:email
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Account details updated Successfully"))
})

const updateUserAvatar = asyncHandler(async(req, res)=>{
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar not found")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if(!avatar.url){
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.User?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")


    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image has been updated"))
})

const updateUserCoverImage = asyncHandler(async(req, res)=>{
    const coverLocalPath = req.file?.path;

    if(!coverLocalPath){
        throw new ApiError(400, "Cover not found")
    }

    const cover = await uploadOnCloudinary(coverLocalPath);
    if(!cover.url){
        throw new ApiError(400, "Error while uploading on cover")
    }

    const user = await User.findByIdAndUpdate(
        req.User?._id,
        {
            $set:{
                coverImage: cover.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image has been updated"))
})


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}

/**Steps we've followed above for user registration**
1.get user details from frontend
2.validation - not empty
3.check if user already exists: username, email
4.check for images, check for avatar
5.upload them to cloudinary, avatar
6.create user object - create entry in db
7.remove password and refresh token field from response
8.check for user creation
9.return response
*/
/**Steps for sign in/login user**
    1.req body -> data
    2.username or email
    3.find the user
    4.password check
    5.access and refresh token
    6.send cookie
    7.send response
*/
/**Step for logout user**
    
 */

