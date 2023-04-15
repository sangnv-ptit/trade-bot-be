"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeConfigs = exports.readConfigs = void 0;
const fs_1 = __importDefault(require("fs"));
const filePath = 'db.json';
const readConfigs = () => {
    try {
        const rawData = fs_1.default.readFileSync(filePath);
        const configs = JSON.parse(rawData.toString());
        return configs;
    }
    catch (error) {
        console.log("Error while reading json db", error);
        return [];
    }
};
exports.readConfigs = readConfigs;
const writeConfigs = (configs) => {
    try {
        const jsonData = JSON.stringify(configs, null, 2);
        fs_1.default.writeFileSync(filePath, jsonData);
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
