"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const ConfigSchema = new mongoose_1.default.Schema({
    symbol: {
        type: String,
        required: true,
        min: 2,
        max: 10,
        unique: true,
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
}, { timestamps: true });
const Config = mongoose_1.default.model("Config", ConfigSchema);
exports.default = Config;
