import dotenv from "dotenv";
import fs from 'fs';
import mongoose from "mongoose";
import configsRoutes from "./routes/configs";
import symbolRoutes from "./routes/symbols";
import loginRouter from "./routes/login";
import express, { Express, Request, Response } from "express";
import cors from "cors";
import bot from "./bot";
import { WebsocketClient, ContractClient } from "bybit-api";
import { readConfigs, writeConfigs } from "./models/config-json";
import { formatNumber } from "./helpers";
import multer, { FileFilterCallback } from "multer";
import TelegramBot from "node-telegram-bot-api";

dotenv.config();
const app: Express = express();

app.use(express.json());
app.use(cors());

// File storage config
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: Function) => {
    cb(null, "./")
  },
  filename: (req: Request, file: Express.Multer.File, cb: Function) => {
    cb(null, 'db.json')
  }
})

const upload = multer({
  storage: storage,
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype !== 'application/json') {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  }
})

// Telegram notification
const telegramApiToken = process.env.TELEGRAM_API_TOKEN || "";
const telegramBot = new TelegramBot(telegramApiToken);

const notify = (message: string) => {
  if (process.env.TELEGRAM_CHAT_ID) {
    telegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID, message)
  }
}

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
const contractClient = new ContractClient({
  key: process.env.API_KEY,
  secret: process.env.API_SECRET,
  testnet: isTestNet,
});
const wsClient = new WebsocketClient({
  key: process.env.API_KEY,
  secret: process.env.API_SECRET,
  testnet: isTestNet,
  market: "contractUSDT",
});

const symbolOpenPriceMap: any = {
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

wsClient.on("update", async (message) => {
  const { data, topic } = message;
  const configs = readConfigs();
  if (topic.startsWith("tickers")) {
    const { symbol, lastPrice } = data;
    const configsOfSymbol = configs.filter(
      (config) => config.symbol === symbol
    );
    if (configs.length == 0) {
      console.log(`[tickers] no config for symbol: ${symbol}`);
      return;
    }
    // Return if Bybit did not send the lastPrice update
    if (!lastPrice) return;
    configsOfSymbol.forEach(async (config) => {
      if (config.orderId) return;
      const lastCandleClosePrice =
        symbolOpenPriceMap[config.interval][config.symbol];
      // Return if no open price yet, in case bot just run
      if (!lastCandleClosePrice) return;

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
        const submitOrderResult = await contractClient.submitOrder({
          side: "Buy",
          symbol,
          price: formatNumber(limitPrice),
          orderType: "Limit",
          qty: formatNumber(qty),
          timeInForce: "GoodTillCancel",
          positionIdx: "1",
        });

        if (submitOrderResult.retMsg !== "OK") {
          console.error(
            `ERROR making long entry order: `,
            JSON.stringify(submitOrderResult, null, 2)
          );
        } else {
          console.log(
            `SUCCESS making long entry order: `,
            JSON.stringify(submitOrderResult, null, 2)
          );
          config.orderId = submitOrderResult.result.orderId;
          writeConfigs(configs);

        }
      } else if (lastPrice > sellConditionPrice && tradeType !== "short") {
        const limitPrice = lastCandleClosePrice + lastCandleClosePrice * oc;
        const tpPrice = limitPrice - (limitPrice - lastCandleClosePrice) * tp;
        const qty = config.amount / limitPrice;

        // call API to submit sell limit order of the config
        const submitOrderResult = await contractClient.submitOrder({
          side: "Sell",
          symbol,
          price: formatNumber(limitPrice),
          orderType: "Limit",
          qty: formatNumber(qty),
          timeInForce: "GoodTillCancel",
          positionIdx: "2",
        });
        if (submitOrderResult.retMsg !== "OK") {
          console.error(
            `ERROR making sell entry order: `,
            JSON.stringify(submitOrderResult, null, 2)
          );
        } else {
          console.log(
            `SUCCESS making sell entry order: `,
            JSON.stringify(submitOrderResult, null, 2)
          );
          config.orderId = submitOrderResult.result.orderId;
          writeConfigs(configs);
        }
      }
    });
  } else if (topic.startsWith("kline.")) {
    // console.log(JSON.stringify(data, null, 2))
    const closedCandle = data.find((ticker: any) => ticker.confirm);
    if (!closedCandle) return;

    const [_, interval, symbol] = topic.split(".");
    const matchedConfigs = configs.filter(
      (config) => config.symbol === symbol && config.interval === interval
    );
    if (matchedConfigs.length === 0) {
      console.log(`[kline] no config for symbol: ${symbol}`);
      // wsClient.unsubscribe(`kline.${interval}.${symbol}`);
      return;
    }

    const lastCandleClosePrice = closedCandle.close;
    symbolOpenPriceMap[interval][symbol] =
      Number.parseFloat(lastCandleClosePrice);

    matchedConfigs.forEach(async (config) => {
      if (!config.orderId) return;
      if (!config.tpOrderId) {
        // call API to cancel an order by orderId
        const cancelOrderResult = await contractClient.cancelOrder({
          symbol,
          orderId: config.orderId,
        });
        if (cancelOrderResult.retMsg !== "OK") {
          console.error(
            `ERROR cancel order: ${config.orderId}`,
            JSON.stringify(cancelOrderResult, null, 2)
          )
          config.orderId = ""
          writeConfigs(configs)
        } else {
          console.log(
            `[SUCCESS] cancel order: ${config.orderId}`,
            JSON.stringify(cancelOrderResult, null, 2)
          )
        }
      } else {
        const getActiveOrdersResult = await contractClient.getActiveOrders({
          orderId: config.tpOrderId,
          symbol,
        });
        if (getActiveOrdersResult.retMsg !== "OK") {
          console.error(
            `ERROR get active orders: `,
            JSON.stringify(getActiveOrdersResult, null, 2)
          );

          return;
        }
        const tpOrder = getActiveOrdersResult.result.list[0];
        if (!tpOrder) return;
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
        } else {
          newTpPrice = oldTpPrice + diff * reduce;
        }

        const modifyOrderResult = await contractClient.modifyOrder({
          symbol,
          orderId: tpOrder.orderId,
          price: formatNumber(newTpPrice),
        });
        if (modifyOrderResult.retMsg !== "OK") {
          console.error(
            `ERROR modify take profit: ${tpOrder.orderId} from ${formatNumber(
              oldTpPrice
            )} to ${formatNumber(newTpPrice)}, before rounding ${newTpPrice}`,
            JSON.stringify(modifyOrderResult, null, 2)
          );
        }
      }
    });
  } else if (topic === "user.order.contractAccount") {
    const cancelledOrder = data.find(
      (item: { orderStatus: string }) => item.orderStatus === "Cancelled"
    );
    if (cancelledOrder) {
      const config = configs.find(
        (config: any) => config.orderId === cancelledOrder.orderId
      );
      if (config) {
        config.orderId = "";
        config.tpOrderId = "";
        writeConfigs(configs)
      }
    }
    const filledOrder = data.find((item: any) => item.orderStatus === "Filled");
    if (filledOrder) {
      const config = configs.find(
        (config: any) => config.orderId === filledOrder.orderId
      );
      if (config) {
        const message = `
          ${filledOrder.symbol} | ${filledOrder.side === 'Buy' ? 'Open Long' : 'Open Short'}
          Futures | Min${config.interval} | OC: ${config.oc}% | TP: ${config.tp}%
          Status: ${filledOrder.leavesQty !== "0" ? "Incompleted" : "Completed"}
          Price: ${filledOrder.avgPrice}, amount: ${filledOrder.cumExecValue}
        `
        notify(message)

        const tpOrderSide = filledOrder.side === "Buy" ? "Sell" : "Buy";
        const tp = config.tp / 100;
        const symbol = config.symbol;
        const openPrice = symbolOpenPriceMap[config.interval][symbol];
        const limitPrice = parseFloat(filledOrder.avgPrice);
        const tpPrice = limitPrice + (openPrice - limitPrice) * tp;
        // call API to submit buy limit order of the config
        const submitOrderResult = await contractClient.submitOrder({
          side: tpOrderSide,
          symbol,
          price: formatNumber(tpPrice),
          orderType: "Limit",
          qty: filledOrder.qty,
          timeInForce: "GoodTillCancel",
          positionIdx: filledOrder.positionIdx,
        });
        if (submitOrderResult.retMsg !== "OK") {
          console.error(
            `ERROR making take profit order: `,
            JSON.stringify(submitOrderResult, null, 2),
            tpPrice
          );
        } else {
          console.log(
            `SUCCESS making take profit order: `,
            JSON.stringify(submitOrderResult, null, 2)
          );
          config.tpOrderId = submitOrderResult.result.orderId;
          writeConfigs(configs)
        }
      }

      const tpConfig = configs.find(
        (config: any) => config.tpOrderId === filledOrder.orderId
      );
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
        writeConfigs(configs)

        setTimeout(async (config: any) => {
          const getClosedProfitAndLossResult = await contractClient.getClosedProfitAndLoss({
            symbol: config.symbol,
            limit: 1,
          });
          const pnl = Number.parseFloat(getClosedProfitAndLossResult.result.list[0].closedPnl);
          const pnlPercentage = (pnl / config.amount) * 100;
          const entryPrice =
            getClosedProfitAndLossResult.result.list[0].avgEntryPrice;
          const exitPrice =
            getClosedProfitAndLossResult.result.list[0].avgExitPrice;
          const entryAmount = getClosedProfitAndLossResult.result.list[0].qty;
          const exitAmount =
            getClosedProfitAndLossResult.result.list[0].closedSize;
          if (pnl > 0) {
            config.winCount += 1;
          } else {
            config.loseCount += 1;
          }
          const message = `
            ${filledOrder.symbol} - ${orderType} | ${pnl > 0 ? 'WIN' : 'LOSE'}
            ${config.winCount} WINS, ${config.loseCount} LOSES
            Buy price: ${
              orderType === "Long" ? entryPrice : exitPrice
            }, amount: ${orderType === "Long" ? entryAmount : exitAmount}
            Sell price: ${
              orderType === "Short" ? entryPrice : exitPrice
            }, amount: ${orderType === "Long" ? entryAmount : exitAmount}
            PNL: $${pnl} ~ ${formatNumber(pnlPercentage)}%
          `
        }, 5000, tpConfig)
      }
    }
  }
});

wsClient.subscribe("user.order.contractAccount");
readConfigs().forEach((config: any) => {
  wsClient.subscribe([
    `kline.${config.interval}.${config.symbol}`,
    `tickers.${config.symbol}`,
  ]);
});

// Routes

app.get("/symbols", async (req: Request, res: Response) => {
  const symbolResult = await contractClient.getSymbolTicker("linear");
  if (symbolResult.retMsg !== "OK") {
    res.status(400).json({ message: `error get symbols` });
  }
  res.status(200).send(symbolResult.result.list.map((symbol) => symbol.symbol));
});

app.get("/configs", async (req: Request, res: Response) => {
  const configs = readConfigs();
  res.status(200).json(configs);
});

app.post("/configs", async (req: Request, res: Response) => {
  const config = { _id: Date.now().toString(), winCount: 0, loseCount: 0, ...req.body };
  await contractClient.setPositionMode({
    symbol: config.symbol,
    mode: 3,
  });
  wsClient.subscribe([
    `kline.${config.interval}.${config.symbol}`,
    `tickers.${config.symbol}`,
  ]);

  const configs = readConfigs();
  const newConfigs = [...configs, config];
  writeConfigs(newConfigs);
  res.status(200).json(config);
});

app.delete("/configs/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const configs = readConfigs();
  const indexToDelete = configs.findIndex((config) => config._id === id);
  if (indexToDelete === -1) {
    console.log(`failed to delete ${id}`);
    res.status(400).json({ message: "Config not found" });
  }
  const deletedConfig = configs.splice(indexToDelete, 1)[0];
  if (deletedConfig.orderId && !deletedConfig.tpOrderId) {
    await contractClient.cancelOrder({
      symbol: deletedConfig.symbol,
      orderId: deletedConfig.orderId,
    });
  }
  const interval = deletedConfig.interval;
  const symbol = deletedConfig.symbol;
  const sameSymbolConfigs = configs.filter(
    (config) => config.symbol === deletedConfig.symbol
  );
  if (sameSymbolConfigs.length !== 0) {
    const sameSymbolAndIntervalConfigs = sameSymbolConfigs.filter(
      (config) => config.interval === deletedConfig.interval
    );
    if (sameSymbolAndIntervalConfigs.length === 0) {
      wsClient.unsubscribe(`kline.${interval}.${symbol}`);
    }
  } else {
    wsClient.unsubscribe([`kline.${interval}.${symbol}`, `tickers.${symbol}`]);
  }
  writeConfigs(configs);
  res.status(200).json(deletedConfig);
});

app.get('/configs/download', (req: Request, res: Response) => {
  try {
    res.download("db.json")
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
})

app.post('/configs/upload', upload.single('file'), (req: any, res: any) => {
  const { path: filePath } = req.file;

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error uploading file');
    } else {
      try {
        const configs = JSON.parse(data);
        // const wsStore = wsClient.getWsStore()
        configs.forEach((config: any) => {
          // wsStore.addTopic('contractUSDTPublic', `kline.${config.interval}.${config.symbol}`)
          // wsStore.addTopic('contractUSDTPublic', `tickers.${config.symbol}`)
          wsClient.subscribe([
            `kline.${config.interval}.${config.symbol}`,
            `tickers.${config.symbol}`,
          ]);
        });
        // wsClient.connectPublic()

        res.status(200).json(configs);
      } catch (err) {
        console.error(err);
        res.status(400).send('Invalid JSON file');
      }
    }
  });
})

app.listen(process.env.PORT);
