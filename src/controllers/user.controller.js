import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

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
    console.log(req.files);

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
    const {email, username, password} = req.body

    if(!username || !email){
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
    
    const loggedInUser = User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly :  true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(200,
        {
            user: loggedInUser,
            accessToken,
            refreshToken
        },
    "User logged In Successfully!")
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

export {
    registerUser,
    loginUser,
    logoutUser
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

