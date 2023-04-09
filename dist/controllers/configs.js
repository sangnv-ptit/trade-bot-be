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
const bot_1 = __importDefault(require("../bot"));
const bybit_api_1 = require("bybit-api");
const config_json_1 = require("../models/config-json");
const getConfigs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // const configs = await Config.find({});
        const configs = (0, config_json_1.readConfigs)();
        res.status(200).json(configs);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.getConfigs = getConfigs;
const createConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // const config = new Config(req.body);
        // await config.save();
        // bot();
        const configs = (0, config_json_1.readConfigs)();
        const config = Object.assign(Object.assign({}, req.body), { _id: Date.now() });
        const newConfigs = [...configs, config];
        console.log("🚀 ~ file: configs.ts:24 ~ createConfig ~ config:", config);
        (0, config_json_1.writeConfigs)(newConfigs);
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
        // const config = await Config.findByIdAndDelete(id);
        const configs = (0, config_json_1.readConfigs)();
        const indexToDelete = configs.findIndex(config => config._id === id);
        const deletedConfig = configs.splice(indexToDelete, 1)[0];
        if (!deletedConfig)
            return;
        if (deletedConfig.orderId && !deletedConfig.tpOrderId) {
            // call API to cancel an order by orderId
            const contractClient = new bybit_api_1.ContractClient({
                key: process.env.API_KEY,
                secret: process.env.API_SECRET,
                testnet: Boolean(process.env.TEST_NET),
            });
            const cancelOrderResult = yield contractClient.cancelOrder({
                symbol: deletedConfig.symbol,
                orderId: deletedConfig.orderId,
            });
            // if (cancelOrderResult.retMsg !== "OK") {
            //   console.error(
            //     `ERROR cancel order: ${deleteConfig.orderId}`,
            //     JSON.stringify(cancelOrderResult, null, 2)
            //   );
            //   return;
            // } else {
            //   console.log(
            //     `SUCCESS cancel order: ${config.orderId}`,
            //     JSON.stringify(cancelOrderResult, null, 2)
            //   );
            // }
        }
        (0, config_json_1.writeConfigs)(configs);
        (0, bot_1.default)();
        res.status(200).json(deletedConfig);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.deleteConfig = deleteConfig;
