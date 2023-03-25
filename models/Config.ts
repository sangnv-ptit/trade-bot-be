import mongoose from "mongoose";

const ConfigSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      min: 2,
      max: 10,
    },
    tradeType: {
      type: String,
      enum: ["both", "long", "short"],
      default: "both",
    },
    amount: {
      type: Number,
      required: true,
    },
    oc: {
      type: Number,
      required: true,
    },
    interval: {
      type: String,
      enum: ["1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D"],
      default: "1",
    },
    extend: {
      type: Number,
      required: true,
    },
    tp: {
      type: Number,
      required: true,
    },
    autoOC: Number,
    reduceMode: String,
    reduce: {
      type: Number,
      required: true,
    },
    ignore: Number,
    orderId: String,
    tpOrderId: String,
  },
  { timestamps: true }
);

const Config = mongoose.model("Config", ConfigSchema);
export default Config;
