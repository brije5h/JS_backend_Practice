import mongoose, {Schema, model} from "mongoose";


const subscriptionSchema = new Schema({
    subscriber:{
        type: Schema.Types.ObjectId, //One who subscribed User's channel
        ref: "User"
    },
    channel: {
        type: Schema.Types.ObjectId, //Channel user has subscribed
        ref: "User"
    }
},{timestamps: true})


export const Subscription = mongoose.model("Subscription", subscriptionSchema)