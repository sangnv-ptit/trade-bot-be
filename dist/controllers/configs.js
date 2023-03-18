"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConfig = exports.createConfig = exports.getConfigs = void 0;
const Config_1 = __importDefault(require("../models/Config"));
const bot_1 = __importDefault(require("../bot"));
const getConfigs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const configs = yield Config_1.default.find({});
        res.status(200).json(configs);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.getConfigs = getConfigs;
const createConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let config = new Config_1.default(req.body);
        yield config.save();
        (0, bot_1.default)();
        res.status(200).json(config);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.createConfig = createConfig;
const deleteConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const config = yield Config_1.default.findByIdAndDelete(id);
        (0, bot_1.default)();
        res.status(200).json(config);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.deleteConfig = deleteConfig;
