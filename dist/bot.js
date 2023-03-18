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
const dotenv = __importStar(require("dotenv"));
const Config_1 = __importDefault(require("./models/Config"));
const bybit_api_1 = require("bybit-api");
dotenv.config();
// const telegramApiToken =
//   process.env.TELEGRAM_API_TOKEN ||
//   "6196940320:AAGbgvosV3v1SSwPOXVt1bMOExTyTKZH2Zg";
// const telegramBot = new TelegramBot(telegramApiToken, { polling: true });
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const TEST_NET = Boolean(process.env.TEST_NET);
let symbolOpenPriceMap = {};
const configWebsocket = () => __awaiter(void 0, void 0, void 0, function* () {
    const wsClient = new bybit_api_1.WebsocketClient({
        key: API_KEY,
        secret: API_SECRET,
        market: "contractUSDT",
        testnet: TEST_NET,
    });
    wsClient.on("update", handleUpdate);
    // wsClient.on("open", (data) => {
    //   console.log("ws connection opened:", data.wsKey);
    // });
    // wsClient.on("response", (data) => {
    //   console.log("ws response: ", JSON.stringify(data, null, 2));
    // });
    // wsClient.on("reconnect", ({ wsKey }) => {
    //   console.log("ws automatically reconnecting.... ", wsKey);
    // });
    // wsClient.on("reconnected", (data) => {
    //   console.log("ws has reconnected ", data?.wsKey);
    // });
    // wsClient.on('error', (err) => {
    //   console.error('error', err);
    // });
    const configs = yield Config_1.default.find({});
    configs.map((config) => {
        wsClient.subscribe([
            `kline.${config.interval}.${config.symbol}`,
            `tickers.${config.symbol}`,
        ]);
    });
    wsClient.subscribe([`user.execution.contractAccount`]);
});
const handleUpdate = (data) => __awaiter(void 0, void 0, void 0, function* () {
    if (data.topic.startsWith("tickers.")) {
        const symbol = data.data.symbol;
        const config = yield Config_1.default.findOne({ symbol: symbol });
        if (!config) {
            console.log(`no config for symbol: ${symbol}`);
            return;
        }
        const currentPrice = data.data.lastPrice;
        if (!currentPrice)
            return;
        const openPrice = symbolOpenPriceMap[symbol];
        if (!openPrice)
            return;
        const contractClient = new bybit_api_1.ContractClient({
            key: API_KEY,
            secret: API_SECRET,
            testnet: TEST_NET,
        });
        // call API to check if there's already an active order of symbol
        const getActiveOrdersResult = yield contractClient.getActiveOrders({
            symbol: symbol,
            limit: 1,
        });
        if (getActiveOrdersResult.retMsg !== "OK" ||
            getActiveOrdersResult.result.list.length > 0)
            return;
        // call API to check if there's already an open position of symbol
        const getPositionsResult = yield contractClient.getPositions({
            symbol: symbol,
        });
        if (getPositionsResult.retMsg !== "OK" ||
            getPositionsResult.result.list[0].side !== "None")
            return;
        const oc = config.oc / 100;
        const gap = openPrice * oc * (config.extend / 100);
        const buyConditionPrice = openPrice - gap;
        const sellConditionPrice = openPrice + gap;
        const tp = config.tp / 100;
        const tradeType = config.tradeType;
        if (currentPrice < buyConditionPrice && tradeType !== "short") {
            const limitPrice = openPrice - openPrice * oc;
            const tpPrice = limitPrice + (openPrice - limitPrice) * tp;
            const qty = config.amount / limitPrice;
            // call API to submit limit order of symbol
            const submitOrderResult = yield contractClient.submitOrder({
                side: "Buy",
                symbol: symbol,
                price: limitPrice.toFixed(4),
                orderType: "Limit",
                qty: qty.toFixed(3),
                timeInForce: "GoodTillCancel",
                takeProfit: tpPrice.toFixed(4),
            });
            if (submitOrderResult.retMsg !== "OK") {
                console.error(`ERROR making long entry order: `, JSON.stringify(submitOrderResult, null, 2));
            }
        }
        if (currentPrice > sellConditionPrice && tradeType !== "long") {
            const limitPrice = openPrice + openPrice * oc;
            const tpPrice = limitPrice - (limitPrice - openPrice) * tp;
            const qty = config.amount / limitPrice;
            // call API to submit limit order of symbol
            const submitOrderResult = yield contractClient.submitOrder({
                side: "Sell",
                symbol: symbol,
                price: limitPrice.toFixed(4),
                orderType: "Limit",
                qty: qty.toFixed(3),
                timeInForce: "GoodTillCancel",
                takeProfit: tpPrice.toFixed(4),
            });
            if (submitOrderResult.retMsg !== "OK") {
                console.error(`ERROR making sell entry order: `, JSON.stringify(submitOrderResult, null, 2));
            }
        }
    }
    else if (data.topic.startsWith("kline.")) {
        const closedTicker = data.data.find((ticker) => ticker.confirm);
        if (closedTicker) {
            const symbol = data.topic.split(".")[2];
            const config = yield Config_1.default.findOne({ symbol: symbol });
            if (!config) {
                console.log(`no config for symbol: ${symbol}`);
                return;
            }
            const openPrice = closedTicker.close;
            symbolOpenPriceMap[symbol] = Number.parseFloat(openPrice);
            const contractClient = new bybit_api_1.ContractClient({
                key: API_KEY,
                secret: API_SECRET,
                testnet: TEST_NET,
            });
            // call API to get current position of symbol
            const getPositionsResult = yield contractClient.getPositions({
                symbol: symbol,
            });
            if (getPositionsResult.retMsg !== "OK") {
                console.error(`ERROR get positions: `, JSON.stringify(getPositionsResult, null, 2));
                return;
            }
            // call API cancel all orders of symbol
            const cancelAllOrdersResult = yield contractClient.cancelAllOrders(symbol);
            if (cancelAllOrdersResult.retMsg !== "OK") {
                console.error(`ERROR cancel orders: `, JSON.stringify(cancelAllOrdersResult, null, 2));
                return;
            }
            const position = getPositionsResult.result.list[0];
            if (position.side === "None")
                return;
            const oldTpPrice = Number.parseFloat(position.takeProfit);
            const diff = Math.abs(oldTpPrice - openPrice);
            const reduce = config.reduce / 100;
            let newTpPrice = oldTpPrice;
            if (position.side === "Buy") {
                newTpPrice = oldTpPrice - diff * reduce;
            }
            else {
                newTpPrice = oldTpPrice + diff * reduce;
            }
            const setTPSLResult = yield contractClient.setTPSL({
                symbol: symbol,
                takeProfit: newTpPrice.toFixed(4),
                positionIdx: 0,
            });
            if (setTPSLResult.retMsg !== "OK") {
                console.error(`ERROR set take profit: `, JSON.stringify(setTPSLResult, null, 2), symbol, oldTpPrice, newTpPrice, new Date());
                return false;
            }
        }
    }
    // } else if (data.topic === `user.execution.contractAccount`) {
    //   console.log("execution data", data);
    //   data.data.map((detail: any) => {
    //     // const message = `${detail.side} ${detail.symbol} at ${detail.execPrice}`;
    //     // telegramBot.sendMessage("1003344491", message);
    //   });
    // }
});
const bot = () => __awaiter(void 0, void 0, void 0, function* () {
    configWebsocket();
});
exports.default = bot;
