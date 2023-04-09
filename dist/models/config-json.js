"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeConfigs = exports.readConfigs = void 0;
const fs = __importStar(require("fs"));
const readConfigs = () => {
    try {
        const rawData = fs.readFileSync('db.json');
        const configs = JSON.parse(rawData.toString());
        return configs;
    }
    catch (error) {
        console.log("Error while reading json db");
        return [];
    }
};
exports.readConfigs = readConfigs;
const writeConfigs = (configs) => {
    try {
        const jsonData = JSON.stringify(configs);
        fs.writeFileSync('db.json', jsonData);
    }
    catch (error) {
        console.log("Error white writing json db");
    }
};
exports.writeConfigs = writeConfigs;
// export const updateConfigOrderId = (orderId: string) => {
//   try {
//   }
// }
