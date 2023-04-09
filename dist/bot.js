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
// const telegramApiToken = process.env.TELEGRAM_API_TOKEN || "";
// const telegramBot = new TelegramBot(telegramApiToken, { polling: true });
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const TEST_NET = Boolean(process.env.TEST_NET);
let symbolOpenPriceMap = {
    "1": {},
    "3": {},
    "5": {},
    "15": {},
    "30": {},
    "60": {},
    "120": {},
    "240": {},
    "360": {},
    "720": {},
    D: {},
};
let isSumbitting = {};
const configWebsocket = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const wsClient = new bybit_api_1.WebsocketClient({
            key: API_KEY,
            secret: API_SECRET,
            market: "contractUSDT",
            testnet: TEST_NET,
        });
        const contractClient = new bybit_api_1.ContractClient({
            key: API_KEY,
            secret: API_SECRET,
            testnet: TEST_NET,
        });
        const setPositionModeResult = yield contractClient.setPositionMode({
            coin: "USDT",
            mode: 3,
        });
        if (setPositionModeResult.retCode !== 0) {
            console.error(`ERROR set position mode`, JSON.stringify(setPositionModeResult, null, 2));
        }
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
        wsClient.on("error", (err) => {
            console.error("error", err);
        });
        // TODO: query distincy symbols, eg: const configs = await Config.distinct('symbol');
        const configs = yield Config_1.default.find();
        configs.map((config) => {
            // TODO: unsubscribe redundant topics
            wsClient.subscribe([
                `kline.${config.interval}.${config.symbol}`,
                `tickers.${config.symbol}`,
            ]);
        });
        wsClient.subscribe([`user.order.contractAccount`]);
    }
    catch (error) {
        console.error(`Unexpected error: `, error);
    }
});
const handleUpdate = (data) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (data.topic.startsWith("tickers.")) {
            handleTickerUpdate(data.data);
        }
        else if (data.topic.startsWith("kline.")) {
            handleKlineUpdate(data.data, data.topic);
        }
        else if (data.topic === `user.order.contractAccount`) {
            handleContractAccountUpdate(data.data);
        }
    }
    catch (error) {
        console.error(`Unexpected error: `, error);
    }
});
const handleTickerUpdate = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const symbol = data.symbol;
    const configs = yield Config_1.default.find({ symbol: symbol });
    if (configs.length == 0) {
        console.log(`no config for symbok: ${symbol}`);
        return;
    }
    // Return if Bybit did not send the lastPrice update
    const currentPrice = data.lastPrice;
    if (!currentPrice)
        return;
    const contractClient = new bybit_api_1.ContractClient({
        key: API_KEY,
        secret: API_SECRET,
        testnet: TEST_NET,
        recv_window: 60000,
    });
    // Call API to set TP mode to Partial for the symbol of the config
    const setTPSLModeResult = yield contractClient.setTPSLMode(symbol, "Partial");
    // if (setTPSLModeResult.retMsg !== "OK") {
    //   console.error(
    //     `ERROR set TP mode symbol: ${symbol}`,
    //     JSON.stringify(setTPSLModeResult, null, 2)
    //   );
    //   return;
    // }
    configs.map((config) => __awaiter(void 0, void 0, void 0, function* () {
        // Return if is submitting an order, to prevent Bybit send ticker too fast -> override config.orderId
        if (isSumbitting[config.id])
            return;
        // Retrun if config already had an active order
        if (config.orderId)
            return;
        const openPrice = symbolOpenPriceMap[config.interval][symbol];
        // Return if no open price yet, in case bot just run
        if (!openPrice)
            return;
        isSumbitting[config.id] = true;
        const oc = config.oc / 100;
        const gap = openPrice * (oc + (config.extend / 100));
        const buyConditionPrice = openPrice - gap;
        const sellConditionPrice = openPrice + gap;
        const tp = config.tp / 100;
        const tradeType = config.tradeType;
        if (currentPrice < buyConditionPrice && tradeType !== "short") {
            const limitPrice = openPrice - openPrice * oc;
            const tpPrice = limitPrice + (openPrice - limitPrice) * tp;
            const qty = config.amount / limitPrice;
            // call API to submit buy limit order of the config
            const submitOrderResult = yield contractClient.submitOrder({
                side: "Buy",
                symbol: symbol,
                price: limitPrice.toFixed(4),
                orderType: "Limit",
                qty: qty.toFixed(3),
                timeInForce: "GoodTillCancel",
                takeProfit: tpPrice.toFixed(4),
                positionIdx: "1",
            });
            if (submitOrderResult.retMsg !== "OK") {
                console.error(`ERROR making long entry order: `, JSON.stringify(submitOrderResult, null, 2));
            }
            else {
                console.log(`SUCCESS making long entry order: `, JSON.stringify(submitOrderResult, null, 2));
                config.orderId = submitOrderResult.result.orderId;
                yield config.save();
            }
        }
        else if (currentPrice > sellConditionPrice && tradeType !== "short") {
            const limitPrice = openPrice + openPrice * oc;
            const tpPrice = limitPrice - (limitPrice - openPrice) * tp;
            const qty = config.amount / limitPrice;
            // call API to submit sell limit order of the config
            const submitOrderResult = yield contractClient.submitOrder({
                side: "Sell",
                symbol: symbol,
                price: limitPrice.toFixed(4),
                orderType: "Limit",
                qty: qty.toFixed(3),
                timeInForce: "GoodTillCancel",
                takeProfit: tpPrice.toFixed(4),
                positionIdx: "2",
            });
            if (submitOrderResult.retMsg !== "OK") {
                console.error(`ERROR making sell entry order: `, JSON.stringify(submitOrderResult, null, 2));
            }
            else {
                config.orderId = submitOrderResult.result.orderId;
                yield config.save();
            }
        }
        isSumbitting[config.id] = false;
    }));
});
const handleKlineUpdate = (data, topic) => __awaiter(void 0, void 0, void 0, function* () {
    const closedTicker = data.find((ticker) => ticker.confirm);
    if (!closedTicker)
        return;
    const [_, interval, symbol] = topic.split(".");
    const configs = yield Config_1.default.find({
        symbol: symbol,
        interval: interval,
    });
    if (configs.length == 0) {
        console.log(`no config for symbol: ${symbol}`);
        return;
    }
    const openPrice = closedTicker.close;
    symbolOpenPriceMap[interval][symbol] = Number.parseFloat(openPrice);
    configs.map((config) => __awaiter(void 0, void 0, void 0, function* () {
        const contractClient = new bybit_api_1.ContractClient({
            key: API_KEY,
            secret: API_SECRET,
            testnet: TEST_NET,
        });
        if (!config.orderId)
            return;
        if (!config.tpOrderId) {
            // call API to cancel an order by orderId
            const cancelOrderResult = yield contractClient.cancelOrder({
                symbol: symbol,
                orderId: config.orderId,
            });
            if (cancelOrderResult.retMsg !== "OK") {
                console.error(`ERROR cancel order: ${config.orderId}`, JSON.stringify(cancelOrderResult, null, 2));
                return;
            }
            else {
                console.log(`SUCCESS cancel order: ${config.orderId}`, JSON.stringify(cancelOrderResult, null, 2));
            }
        }
        else {
            const getActiveOrdersResult = yield contractClient.getActiveOrders({
                orderId: config.tpOrderId,
                symbol: symbol,
            });
            if (getActiveOrdersResult.retMsg !== "OK") {
                console.error(`ERROR get active orders: `, JSON.stringify(getActiveOrdersResult, null, 2));
                return;
            }
            else {
                const tpOrder = getActiveOrdersResult.result.list[0];
                const currentTime = new Date().getTime();
                const tpOrderCreatedTime = Number.parseInt(tpOrder.createdTime);
                // no reduce before 2 mins
                if (currentTime - tpOrderCreatedTime < 120000) {
                    return;
                }
                const oldTpPrice = Number.parseFloat(tpOrder.triggerPrice);
                const diff = Math.abs(oldTpPrice - openPrice);
                const reduce = config.reduce / 100;
                let newTpPrice = oldTpPrice;
                if (tpOrder.side === "Sell") {
                    newTpPrice = oldTpPrice - diff * reduce;
                }
                else {
                    newTpPrice = oldTpPrice + diff * reduce;
                }
                let modifyOrderResult = yield contractClient.modifyOrder({
                    symbol: symbol,
                    orderId: tpOrder.orderId,
                    triggerPrice: newTpPrice.toFixed(4),
                });
                if (modifyOrderResult.retMsg !== "OK") {
                    console.error(`ERROR modify take profit: ${tpOrder.orderId} from ${oldTpPrice.toFixed(4)} to ${newTpPrice.toFixed(4)}`, JSON.stringify(modifyOrderResult, null, 2));
                }
            }
        }
    }));
});
const handleContractAccountUpdate = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const cancelledOrder = data.find((item) => {
        return item.orderStatus === "Cancelled";
    });
    if (cancelledOrder) {
        const config = yield Config_1.default.findOne({
            orderId: cancelledOrder.orderId,
        });
        if (config) {
            config.orderId = "";
            config.tpOrderId = "";
            yield config.save();
        }
    }
    const filledOrder = data.find((item) => {
        return (item.orderStatus === "Filled" //|| item.orderStatus === "PartiallyFilled"
        );
    });
    if (filledOrder) {
        // when take profit order filled, order type can only be market -> no partially filled
        if (filledOrder.stopOrderType === "PartialTakeProfit") {
            const config = yield Config_1.default.findOne({
                tpOrderId: filledOrder.orderId,
            });
            if (config) {
                const orderType = filledOrder.side === "Buy" ? "Short" : "Long";
                const message = `
          ${filledOrder.symbol} | Close${orderType}
          Bot:...
          Futures | Min${config.interval} | OC: ${config.oc}% | TP: ${config.tp}%
          Status: Completed
          Price: ${filledOrder.lastExecPrice}, amount: ${filledOrder.cumExecValue}
        `;
                notify(message);
                setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                    const contractClient = new bybit_api_1.ContractClient({
                        key: API_KEY,
                        secret: API_SECRET,
                        testnet: TEST_NET,
                    });
                    const getClosedProfitAndLossResult = yield contractClient.getClosedProfitAndLoss({
                        symbol: config.symbol,
                        limit: 1,
                    });
                    const pnl = Number.parseFloat(getClosedProfitAndLossResult.result.list[0].closedPnl);
                    const pnlPercentage = (pnl / config.amount) * 100;
                    const entryPrice = getClosedProfitAndLossResult.result.list[0].avgEntryPrice;
                    const exitPrice = getClosedProfitAndLossResult.result.list[0].avgExitPrice;
                    const entryAmount = getClosedProfitAndLossResult.result.list[0].qty;
                    const exitAmount = getClosedProfitAndLossResult.result.list[0].closedSize;
                    if (pnl > 0) {
                        config.winCount += 1;
                    }
                    else {
                        config.loseCount += 1;
                    }
                    const newMessage = `
                  ${filledOrder.symbol} - ${orderType} | ${pnl > 0 ? "WIN" : "LOSE"}
                  Bot:...
                  ${config.winCount} WINS, ${config.loseCount} LOSES
                  Buy price: ${orderType === "Long" ? entryPrice : exitPrice}, amount: ${orderType === "Long" ? entryAmount : exitAmount}
                  Sell price: ${orderType === "Short" ? entryPrice : exitPrice}, amount: ${orderType === "Long" ? entryAmount : exitAmount}
                  PNL: $${pnl} ~ ${pnlPercentage.toFixed(4)}%
                `;
                    notify(newMessage);
                }), 5000);
                config.orderId = "";
                config.tpOrderId = "";
                yield config.save();
            }
        }
        // when limit order filled, can be partially filled
        else {
            const tpOrder = data[1];
            const config = yield Config_1.default.findOne({ orderId: filledOrder.orderId });
            if (config) {
                const side = filledOrder.side === "Buy" ? "OpenLong" : "OpenShort";
                const message = `
          ${filledOrder.symbol} | ${side}
          Bot:...
          Futures | Min${config.interval} | OC: ${config.oc}% | TP: ${config.tp}%
          Status: ${filledOrder.leavesQty !== "0" ? "Incompleted" : "Completed"}
          Price: ${filledOrder.avgPrice}, amount: ${filledOrder.cumExecValue}
        `;
                notify(message);
                config.tpOrderId = tpOrder.orderId;
                yield config.save();
            }
        }
    }
});
const notify = (message) => {
    // telegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID || "", message);
};
const bot = () => __awaiter(void 0, void 0, void 0, function* () {
    configWebsocket();
});
exports.default = bot;
