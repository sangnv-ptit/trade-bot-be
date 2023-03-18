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
const express_1 = __importDefault(require("express"));
const bybit_api_1 = require("bybit-api");
const router = express_1.default.Router();
const TEST_NET = Boolean(process.env.TEST_NET);
router.get('/symbols', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const restClient = new bybit_api_1.ContractClient({
            key: process.env.API_KEY,
            secret: process.env.API_SECRET,
            testnet: TEST_NET,
        });
        const symbolsResult = yield restClient.getSymbolTicker('linear');
        if (symbolsResult.retMsg !== 'OK') {
            console.error(`ERROR get positions: `, JSON.stringify(symbolsResult, null, 2));
        }
        res.status(200).send(symbolsResult.result.list.map((symbol) => symbol.symbol));
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
}));
exports.default = router;
