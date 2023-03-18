import * as dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import Config from "./models/Config";
import {
  API_ERROR_CODE,
  APIMarket,
  LinearClient,
  ContractClient,
  LinearPositionIdx,
  WebsocketClient,
  WS_KEY_MAP,
} from "bybit-api";

dotenv.config();
// const telegramApiToken =
//   process.env.TELEGRAM_API_TOKEN ||
//   "6196940320:AAGbgvosV3v1SSwPOXVt1bMOExTyTKZH2Zg";
// const telegramBot = new TelegramBot(telegramApiToken, { polling: true });

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const TEST_NET = Boolean(process.env.TEST_NET);
let symbolOpenPriceMap: any = {};

const configWebsocket = async () => {
  const wsClient = new WebsocketClient({
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
  const configs = await Config.find({});
  configs.map((config: any) => {
    wsClient.subscribe([
      `kline.${config.interval}.${config.symbol}`,
      `tickers.${config.symbol}`,
    ]);
  });
  wsClient.subscribe([`user.execution.contractAccount`]);
}

const handleUpdate = async (data:any) => {
  if (data.topic.startsWith("tickers.")) {
    const symbol = data.data.symbol;
    const config = await Config.findOne({ symbol: symbol });
    if (!config) {
      console.log(`no config for symbol: ${symbol}`)
      return
    }
    
    const currentPrice = data.data.lastPrice
    if (!currentPrice) return

    const openPrice = symbolOpenPriceMap[symbol]
    if (!openPrice) return

    const contractClient = new ContractClient({
      key: API_KEY,
      secret: API_SECRET,
      testnet: TEST_NET,
    });

    // call API to check if there's already an active order of symbol
    const getActiveOrdersResult = await contractClient.getActiveOrders({symbol: symbol, limit: 1})
    if (getActiveOrdersResult.retMsg !== "OK" || getActiveOrdersResult.result.list.length > 0) return;

    // call API to check if there's already an open position of symbol
    const getPositionsResult = await contractClient.getPositions({ symbol: symbol})
    if (getPositionsResult.retMsg !== "OK" || getPositionsResult.result.list[0].side !== 'None') return;

    const oc = config.oc / 100
    const gap = openPrice * oc * (config.extend / 100)
    const buyConditionPrice = openPrice - gap;
    const sellConditionPrice = openPrice + gap;
    const tp = config.tp / 100
    const tradeType = config.tradeType
    if (currentPrice < buyConditionPrice && tradeType !== "short") {
      const limitPrice = openPrice - openPrice * oc;
      const tpPrice = (limitPrice + (openPrice - limitPrice) * tp)
      const qty = (config.amount / limitPrice);

      // call API to submit limit order of symbol
      const submitOrderResult = await contractClient.submitOrder({
        side: "Buy",
        symbol: symbol,
        price: limitPrice.toFixed(2),
        orderType: "Limit",
        qty: qty.toFixed(2),
        timeInForce: "GoodTillCancel",
        takeProfit: tpPrice.toFixed(2),
      })
      if (submitOrderResult.retMsg !== "OK") {
        console.error(
          `ERROR making long entry order: `,
          JSON.stringify(submitOrderResult, null, 2)
        );
      }
    }
    if (currentPrice > sellConditionPrice && tradeType !== "long") {
      const limitPrice = openPrice + openPrice * oc;
      const tpPrice = (limitPrice - (limitPrice - openPrice) * tp)
      const qty = (config.amount / limitPrice);
      
      // call API to submit limit order of symbol
      const submitOrderResult = await contractClient.submitOrder({
        side: "Sell",
        symbol: symbol,
        price: limitPrice.toFixed(2),
        orderType: "Limit",
        qty: qty.toFixed(2),
        timeInForce: "GoodTillCancel",
        takeProfit: tpPrice.toFixed(2),
      })
      if (submitOrderResult.retMsg !== "OK") {
        console.error(
          `ERROR making sell entry order: `,
          JSON.stringify(submitOrderResult, null, 2)
        );
      }
    }
    
  } else if (data.topic.startsWith("kline.")) {
    const closedTicker = data.data.find((ticker: any) => ticker.confirm);
    if (closedTicker) {
      const symbol = data.topic.split(".")[2];
      const config = await Config.findOne({ symbol: symbol });
      if (!config) {
        console.log(`no config for symbol: ${symbol}`)
        return
      }
      const openPrice = closedTicker.close
      symbolOpenPriceMap[symbol] = Number.parseFloat(openPrice);
      const contractClient = new ContractClient({
        key: API_KEY,
        secret: API_SECRET,
        testnet: TEST_NET,
      });

      // call API to get current position of symbol
      const getPositionsResult = await contractClient.getPositions({ symbol: symbol });
      if (getPositionsResult.retMsg !== "OK") {
        console.error(
          `ERROR get positions: `,
          JSON.stringify(getPositionsResult, null, 2)
        );
        return;
      }

      // call API cancel all orders of symbol
      const cancelAllOrdersResult = await contractClient.cancelAllOrders(symbol);
      if (cancelAllOrdersResult.retMsg !== "OK") {
        console.error(
          `ERROR cancel orders: `,
          JSON.stringify(cancelAllOrdersResult, null, 2)
        );
        return
      }

      const position = getPositionsResult.result.list[0];
      if (position.side === "None") return;
      const oldTpPrice = Number.parseFloat(position.takeProfit)
      const diff = Math.abs(oldTpPrice - openPrice)
      const reduce = config.reduce / 100
      let newTpPrice = oldTpPrice
      if (position.side === "Buy") {
        newTpPrice = oldTpPrice - diff * reduce
      } else {
        newTpPrice = oldTpPrice + diff * reduce;
      }
      const setTPSLResult = await contractClient.setTPSL({
        symbol: symbol,
        takeProfit: newTpPrice.toFixed(2),
        positionIdx: 0,
      })
      if (setTPSLResult.retMsg !== "OK") {
        console.error(
          `ERROR set take profit: `,
          JSON.stringify(setTPSLResult, null, 2),
          symbol, oldTpPrice, newTpPrice, new Date()
        );
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
}

const bot = () => {
  configWebsocket()
}

export default bot;
