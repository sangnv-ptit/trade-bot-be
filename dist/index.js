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
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bybit_api_1 = require("bybit-api");
const config_json_1 = require("./models/config-json");
const helpers_1 = require("./helpers");
const multer_1 = __importDefault(require("multer"));
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
// File storage config
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./");
    },
    filename: (req, file, cb) => {
        cb(null, 'db.json');
    }
});
const upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/json') {
            return cb(new Error('Invalid file type'));
        }
        cb(null, true);
    }
});
// Telegram notification
const telegramApiToken = process.env.TELEGRAM_API_TOKEN || "";
const telegramBot = new node_telegram_bot_api_1.default(telegramApiToken);
const notify = (message) => {
    if (process.env.TELEGRAM_CHAT_ID) {
        telegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
    }
};
/* ROUTES */
// app.use("/symbols", symbolRoutes);
// app.use("/configs", configsRoutes);
// app.use('/login', loginRouter);
/* MONGOOSE SETUP */
// const PORT = process.env.PORT || 8000;
// mongoose
//   .connect(process.env.MONGO_URL || "")
//   .then(() => {
// app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
//   })
//   .catch((error) => console.log(`${error} did not connect`));
// bot();
const isTestNet = process.env.TEST_NET === "true";
const contractClient = new bybit_api_1.ContractClient({
    key: process.env.API_KEY,
    secret: process.env.API_SECRET,
    testnet: isTestNet,
});
const wsClient = new bybit_api_1.WebsocketClient({
    key: process.env.API_KEY,
    secret: process.env.API_SECRET,
    testnet: isTestNet,
    market: "contractUSDT",
});
const symbolOpenPriceMap = {
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
wsClient.on("error", (err) => {
    console.error("ws error", err);
});
wsClient.on("update", (message) => __awaiter(void 0, void 0, void 0, function* () {
    const { data, topic } = message;
    const configs = (0, config_json_1.readConfigs)();
    if (topic.startsWith("tickers")) {
        const { symbol, lastPrice } = data;
        const configsOfSymbol = configs.filter((config) => config.symbol === symbol);
        if (configs.length == 0) {
            console.log(`[tickers] no config for symbol: ${symbol}`);
            return;
        }
        // Return if Bybit did not send the lastPrice update
        if (!lastPrice)
            return;
        configsOfSymbol.forEach((config) => __awaiter(void 0, void 0, void 0, function* () {
            if (config.orderId)
                return;
            const lastCandleClosePrice = symbolOpenPriceMap[config.interval][config.symbol];
            // Return if no open price yet, in case bot just run
            if (!lastCandleClosePrice)
                return;
            const oc = config.oc / 100;
            const gap = lastCandleClosePrice * oc * (config.extend / 100);
            const buyConditionPrice = lastCandleClosePrice - gap;
            const sellConditionPrice = lastCandleClosePrice + gap;
            const tp = config.tp / 100;
            const tradeType = config.tradeType;
            if (lastPrice < buyConditionPrice && tradeType !== "short") {
                const limitPrice = lastCandleClosePrice - lastCandleClosePrice * oc;
                const qty = config.amount / limitPrice;
                // call API to submit buy limit order of the config
                const submitOrderResult = yield contractClient.submitOrder({
                    side: "Buy",
                    symbol,
                    price: (0, helpers_1.formatNumber)(limitPrice),
                    orderType: "Limit",
                    qty: (0, helpers_1.formatNumber)(qty),
                    timeInForce: "GoodTillCancel",
                    positionIdx: "1",
                });
                if (submitOrderResult.retMsg !== "OK") {
                    console.error(`ERROR making long entry order: `, JSON.stringify(submitOrderResult, null, 2));
                }
                else {
                    console.log(`SUCCESS making long entry order: `, JSON.stringify(submitOrderResult, null, 2));
                    config.orderId = submitOrderResult.result.orderId;
                    (0, config_json_1.writeConfigs)(configs);
                }
            }
            else if (lastPrice > sellConditionPrice && tradeType !== "short") {
                const limitPrice = lastCandleClosePrice + lastCandleClosePrice * oc;
                const tpPrice = limitPrice - (limitPrice - lastCandleClosePrice) * tp;
                const qty = config.amount / limitPrice;
                // call API to submit sell limit order of the config
                const submitOrderResult = yield contractClient.submitOrder({
                    side: "Sell",
                    symbol,
                    price: (0, helpers_1.formatNumber)(limitPrice),
                    orderType: "Limit",
                    qty: (0, helpers_1.formatNumber)(qty),
                    timeInForce: "GoodTillCancel",
                    positionIdx: "2",
                });
                if (submitOrderResult.retMsg !== "OK") {
                    console.error(`ERROR making sell entry order: `, JSON.stringify(submitOrderResult, null, 2));
                }
                else {
                    console.log(`SUCCESS making sell entry order: `, JSON.stringify(submitOrderResult, null, 2));
                    config.orderId = submitOrderResult.result.orderId;
                    (0, config_json_1.writeConfigs)(configs);
                }
            }
        }));
    }
    else if (topic.startsWith("kline.")) {
        // console.log(JSON.stringify(data, null, 2))
        const closedCandle = data.find((ticker) => ticker.confirm);
        if (!closedCandle)
            return;
        const [_, interval, symbol] = topic.split(".");
        const matchedConfigs = configs.filter((config) => config.symbol === symbol && config.interval === interval);
        if (matchedConfigs.length === 0) {
            console.log(`[kline] no config for symbol: ${symbol}`);
            // wsClient.unsubscribe(`kline.${interval}.${symbol}`);
            return;
        }
        const lastCandleClosePrice = closedCandle.close;
        symbolOpenPriceMap[interval][symbol] =
            Number.parseFloat(lastCandleClosePrice);
        matchedConfigs.forEach((config) => __awaiter(void 0, void 0, void 0, function* () {
            if (!config.orderId)
                return;
            if (!config.tpOrderId) {
                // call API to cancel an order by orderId
                const cancelOrderResult = yield contractClient.cancelOrder({
                    symbol,
                    orderId: config.orderId,
                });
                if (cancelOrderResult.retMsg !== "OK") {
                    console.error(`ERROR cancel order: ${config.orderId}`, JSON.stringify(cancelOrderResult, null, 2));
                    config.orderId = "";
                    (0, config_json_1.writeConfigs)(configs);
                }
                else {
                    console.log(`[SUCCESS] cancel order: ${config.orderId}`, JSON.stringify(cancelOrderResult, null, 2));
                }
            }
            else {
                const getActiveOrdersResult = yield contractClient.getActiveOrders({
                    orderId: config.tpOrderId,
                    symbol,
                });
                if (getActiveOrdersResult.retMsg !== "OK") {
                    console.error(`ERROR get active orders: `, JSON.stringify(getActiveOrdersResult, null, 2));
                    return;
                }
                const tpOrder = getActiveOrdersResult.result.list[0];
                if (!tpOrder)
                    return;
                const currentTime = new Date().getTime();
                const tpOrderCreatedTime = Number.parseInt(tpOrder.createdTime);
                // no reduce before 2 mins
                if (currentTime - tpOrderCreatedTime < 120000) {
                    return;
                }
                const oldTpPrice = Number.parseFloat(tpOrder.price);
                const diff = Math.abs(oldTpPrice - lastCandleClosePrice);
                const reduce = config.reduce / 100;
                let newTpPrice = oldTpPrice;
                if (tpOrder.side === "Sell") {
                    newTpPrice = oldTpPrice - diff * reduce;
                }
                else {
                    newTpPrice = oldTpPrice + diff * reduce;
                }
                const modifyOrderResult = yield contractClient.modifyOrder({
                    symbol,
                    orderId: tpOrder.orderId,
                    price: (0, helpers_1.formatNumber)(newTpPrice),
                });
                if (modifyOrderResult.retMsg !== "OK") {
                    console.error(`ERROR modify take profit: ${tpOrder.orderId} from ${(0, helpers_1.formatNumber)(oldTpPrice)} to ${(0, helpers_1.formatNumber)(newTpPrice)}, before rounding ${newTpPrice}`, JSON.stringify(modifyOrderResult, null, 2));
                }
            }
        }));
    }
    else if (topic === "user.order.contractAccount") {
        const cancelledOrder = data.find((item) => item.orderStatus === "Cancelled");
        if (cancelledOrder) {
            const config = configs.find((config) => config.orderId === cancelledOrder.orderId);
            if (config) {
                config.orderId = "";
                config.tpOrderId = "";
                (0, config_json_1.writeConfigs)(configs);
            }
        }
        const filledOrder = data.find((item) => item.orderStatus === "Filled");
        if (filledOrder) {
            const config = configs.find((config) => config.orderId === filledOrder.orderId);
            if (config) {
                const message = `
          ${filledOrder.symbol} | ${filledOrder.side === 'Buy' ? 'Open Long' : 'Open Short'}
          Futures | Min${config.interval} | OC: ${config.oc}% | TP: ${config.tp}%
          Status: ${filledOrder.leavesQty !== "0" ? "Incompleted" : "Completed"}
          Price: ${filledOrder.avgPrice}, amount: ${filledOrder.cumExecValue}
        `;
                notify(message);
                const tpOrderSide = filledOrder.side === "Buy" ? "Sell" : "Buy";
                const tp = config.tp / 100;
                const symbol = config.symbol;
                const openPrice = symbolOpenPriceMap[config.interval][symbol];
                const limitPrice = parseFloat(filledOrder.avgPrice);
                const tpPrice = limitPrice + (openPrice - limitPrice) * tp;
                // call API to submit buy limit order of the config
                const submitOrderResult = yield contractClient.submitOrder({
                    side: tpOrderSide,
                    symbol,
                    price: (0, helpers_1.formatNumber)(tpPrice),
                    orderType: "Limit",
                    qty: filledOrder.qty,
                    timeInForce: "GoodTillCancel",
                    positionIdx: filledOrder.positionIdx,
                });
                if (submitOrderResult.retMsg !== "OK") {
                    console.error(`ERROR making take profit order: `, JSON.stringify(submitOrderResult, null, 2), tpPrice);
                }
                else {
                    console.log(`SUCCESS making take profit order: `, JSON.stringify(submitOrderResult, null, 2));
                    config.tpOrderId = submitOrderResult.result.orderId;
                    (0, config_json_1.writeConfigs)(configs);
                }
            }
            const tpConfig = configs.find((config) => config.tpOrderId === filledOrder.orderId);
            if (tpConfig) {
                const orderType = filledOrder.side === "Buy" ? "Short" : "Long";
                const message = `
          ${filledOrder.symbol} | Close ${orderType}
          Futures | Min${tpConfig.interval} | OC: ${tpConfig.oc}% | TP: ${tpConfig.tp}%
          Status: ${filledOrder.leavesQty !== "0" ? "Incompleted" : "Completed"}
          Price: ${filledOrder.lastExecPrice}, amount: ${filledOrder.cumExecValue}
        `;
                notify(message);
                tpConfig.orderId = "";
                tpConfig.tpOrderId = "";
                (0, config_json_1.writeConfigs)(configs);
                setTimeout((config) => __awaiter(void 0, void 0, void 0, function* () {
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
                    const message = `
            ${filledOrder.symbol} - ${orderType} | ${pnl > 0 ? 'WIN' : 'LOSE'}
            ${config.winCount} WINS, ${config.loseCount} LOSES
            Buy price: ${orderType === "Long" ? entryPrice : exitPrice}, amount: ${orderType === "Long" ? entryAmount : exitAmount}
            Sell price: ${orderType === "Short" ? entryPrice : exitPrice}, amount: ${orderType === "Long" ? entryAmount : exitAmount}
            PNL: $${pnl} ~ ${(0, helpers_1.formatNumber)(pnlPercentage)}%
          `;
                }), 5000, tpConfig);
            }
        }
    }
}));
wsClient.subscribe("user.order.contractAccount");
(0, config_json_1.readConfigs)().forEach((config) => {
    wsClient.subscribe([
        `kline.${config.interval}.${config.symbol}`,
        `tickers.${config.symbol}`,
    ]);
});
// Routes
app.get("/symbols", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const symbolResult = yield contractClient.getSymbolTicker("linear");
    if (symbolResult.retMsg !== "OK") {
        res.status(400).json({ message: `error get symbols` });
    }
    res.status(200).send(symbolResult.result.list.map((symbol) => symbol.symbol));
}));
app.get("/configs", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const configs = (0, config_json_1.readConfigs)();
    res.status(200).json(configs);
}));
app.post("/configs", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const config = Object.assign({ _id: Date.now().toString(), winCount: 0, loseCount: 0 }, req.body);
    yield contractClient.setPositionMode({
        symbol: config.symbol,
        mode: 3,
    });
    wsClient.subscribe([
        `kline.${config.interval}.${config.symbol}`,
        `tickers.${config.symbol}`,
    ]);
    const configs = (0, config_json_1.readConfigs)();
    const newConfigs = [...configs, config];
    (0, config_json_1.writeConfigs)(newConfigs);
    res.status(200).json(config);
}));
app.delete("/configs/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const configs = (0, config_json_1.readConfigs)();
    const indexToDelete = configs.findIndex((config) => config._id === id);
    if (indexToDelete === -1) {
        console.log(`failed to delete ${id}`);
        res.status(400).json({ message: "Config not found" });
    }
    const deletedConfig = configs.splice(indexToDelete, 1)[0];
    if (deletedConfig.orderId && !deletedConfig.tpOrderId) {
        yield contractClient.cancelOrder({
            symbol: deletedConfig.symbol,
            orderId: deletedConfig.orderId,
        });
    }
    const interval = deletedConfig.interval;
    const symbol = deletedConfig.symbol;
    const sameSymbolConfigs = configs.filter((config) => config.symbol === deletedConfig.symbol);
    if (sameSymbolConfigs.length !== 0) {
        const sameSymbolAndIntervalConfigs = sameSymbolConfigs.filter((config) => config.interval === deletedConfig.interval);
        if (sameSymbolAndIntervalConfigs.length === 0) {
            wsClient.unsubscribe(`kline.${interval}.${symbol}`);
        }
    }
    else {
        wsClient.unsubscribe([`kline.${interval}.${symbol}`, `tickers.${symbol}`]);
    }
    (0, config_json_1.writeConfigs)(configs);
    res.status(200).json(deletedConfig);
}));
app.get('/configs/download', (req, res) => {
    try {
        res.download("db.json");
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
app.post('/configs/upload', upload.single('file'), (req, res) => {
    const { path: filePath } = req.file;
    fs_1.default.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error uploading file');
        }
        else {
            try {
                const configs = JSON.parse(data);
                // const wsStore = wsClient.getWsStore()
                configs.forEach((config) => {
                    // wsStore.addTopic('contractUSDTPublic', `kline.${config.interval}.${config.symbol}`)
                    // wsStore.addTopic('contractUSDTPublic', `tickers.${config.symbol}`)
                    wsClient.subscribe([
                        `kline.${config.interval}.${config.symbol}`,
                        `tickers.${config.symbol}`,
                    ]);
                });
                // wsClient.connectPublic()
                res.status(200).json(configs);
            }
            catch (err) {
                console.error(err);
                res.status(400).send('Invalid JSON file');
            }
        }
    });
});
app.listen(process.env.PORT);
