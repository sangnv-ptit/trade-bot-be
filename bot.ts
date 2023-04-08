import * as dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import Config from "./models/Config";
import { ContractClient, WebsocketClient } from "bybit-api";

dotenv.config();
const telegramApiToken = process.env.TELEGRAM_API_TOKEN || "";
const telegramBot = new TelegramBot(telegramApiToken, { polling: true });

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const TEST_NET = Boolean(process.env.TEST_NET);
let symbolOpenPriceMap: any = {
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
let isSumbitting: any = {};

const configWebsocket = async () => {
  try {
    const wsClient = new WebsocketClient({
      key: API_KEY,
      secret: API_SECRET,
      market: "contractUSDT",
      testnet: TEST_NET,
    });

    const contractClient = new ContractClient({
      key: API_KEY,
      secret: API_SECRET,
      testnet: TEST_NET,
    });

    const setPositionModeResult = await contractClient.setPositionMode({
      coin: "USDT",
      mode: 3,
    });
    if (setPositionModeResult.retCode !== 0) {
      console.error(
        `ERROR set position mode`,
        JSON.stringify(setPositionModeResult, null, 2)
      );
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
    const configs = await Config.find();
    configs.map((config: any) => {
      // TODO: unsubscribe redundant topics
      wsClient.subscribe([
        `kline.${config.interval}.${config.symbol}`,
        `tickers.${config.symbol}`,
      ]);
    });
    wsClient.subscribe([`user.order.contractAccount`]);
  } catch (error) {
    console.error(`Unexpected error: `, error);
  }
};

const handleUpdate = async (data: any) => {
  try {
    if (data.topic.startsWith("tickers.")) {
      handleTickerUpdate(data.data);
    } else if (data.topic.startsWith("kline.")) {
      handleKlineUpdate(data.data, data.topic);
    } else if (data.topic === `user.order.contractAccount`) {
      handleContractAccountUpdate(data.data);
    }
  } catch (error) {
    console.error(`Unexpected error: `, error);
  }
};

const handleTickerUpdate = async (data: any) => {
  const symbol = data.symbol;
  const configs = await Config.find({ symbol: symbol });
  if (configs.length == 0) {
    console.log(`no config for symbok: ${symbol}`);
    return;
  }

  // Return if Bybit did not send the lastPrice update
  const currentPrice = data.lastPrice;
  if (!currentPrice) return;

  const contractClient = new ContractClient({
    key: API_KEY,
    secret: API_SECRET,
    testnet: TEST_NET,
    recv_window: 60000,
  });

  // Call API to set TP mode to Partial for the symbol of the config
  const setTPSLModeResult = await contractClient.setTPSLMode(symbol, "Partial");
  // if (setTPSLModeResult.retMsg !== "OK") {
  //   console.error(
  //     `ERROR set TP mode symbol: ${symbol}`,
  //     JSON.stringify(setTPSLModeResult, null, 2)
  //   );
  //   return;
  // }

  configs.map(async (config) => {
    // Return if is submitting an order, to prevent Bybit send ticker too fast -> override config.orderId
    if (isSumbitting[config.id]) return;

    // Retrun if config already had an active order
    if (config.orderId) return;

    const openPrice = symbolOpenPriceMap[config.interval][symbol];
    // Return if no open price yet, in case bot just run
    if (!openPrice) return;

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
      const submitOrderResult = await contractClient.submitOrder({
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
        await config.save();
      }
    } else if (currentPrice > sellConditionPrice && tradeType !== "short") {
      const limitPrice = openPrice + openPrice * oc;
      const tpPrice = limitPrice - (limitPrice - openPrice) * tp;
      const qty = config.amount / limitPrice;

      // call API to submit sell limit order of the config
      const submitOrderResult = await contractClient.submitOrder({
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
        console.error(
          `ERROR making sell entry order: `,
          JSON.stringify(submitOrderResult, null, 2)
        );
      } else {
        config.orderId = submitOrderResult.result.orderId;
        await config.save();
      }
    }
    isSumbitting[config.id] = false;
  });
};

const handleKlineUpdate = async (data: any, topic: string) => {
  console.log("kline received")
  const closedTicker = data.find((ticker: any) => ticker.confirm);
  if (!closedTicker) return;

  const [_, interval, symbol] = topic.split(".");
  const configs = await Config.find({
    symbol: symbol,
    interval: interval,
  });
  if (configs.length == 0) {
    console.log(`no config for symbol: ${symbol}`);
    return;
  }
  const openPrice = closedTicker.close;
  symbolOpenPriceMap[interval][symbol] = Number.parseFloat(openPrice);

  configs.map(async (config) => {
    const contractClient = new ContractClient({
      key: API_KEY,
      secret: API_SECRET,
      testnet: TEST_NET,
    });
    if (!config.orderId) return;
    if (!config.tpOrderId) {
      // call API to cancel an order by orderId
      const cancelOrderResult = await contractClient.cancelOrder({
        symbol: symbol,
        orderId: config.orderId,
      });
      if (cancelOrderResult.retMsg !== "OK") {
        console.error(
          `ERROR cancel order: ${config.orderId}`,
          JSON.stringify(cancelOrderResult, null, 2)
        );
        return;
      } else {
        console.log(
          `SUCCESS cancel order: ${config.orderId}`,
          JSON.stringify(cancelOrderResult, null, 2)
        );
      }
    } else {
      const getActiveOrdersResult = await contractClient.getActiveOrders({
        orderId: config.tpOrderId,
        symbol: symbol,
      });
      if (getActiveOrdersResult.retMsg !== "OK") {
        console.error(
          `ERROR get active orders: `,
          JSON.stringify(getActiveOrdersResult, null, 2)
        );
        return;
      } else {
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
        } else {
          newTpPrice = oldTpPrice + diff * reduce;
        }

        let modifyOrderResult = await contractClient.modifyOrder({
          symbol: symbol,
          orderId: tpOrder.orderId,
          triggerPrice: newTpPrice.toFixed(4),
        });
        if (modifyOrderResult.retMsg !== "OK") {
          console.error(
            `ERROR modify take profit: ${
              tpOrder.orderId
            } from ${oldTpPrice.toFixed(4)} to ${newTpPrice.toFixed(4)}`,
            JSON.stringify(modifyOrderResult, null, 2)
          );
        }
      }
    }
  });
};

const handleContractAccountUpdate = async (data: any) => {
  const cancelledOrder = data.find((item: any) => {
    return item.orderStatus === "Cancelled";
  });
  if (cancelledOrder) {
    const config = await Config.findOne({
      orderId: cancelledOrder.orderId,
    });
    if (config) {
      config.orderId = "";
      config.tpOrderId = "";
      await config.save();
    }
  }

  const filledOrder = data.find((item: any) => {
    return (
      item.orderStatus === "Filled" || item.orderStatus === "PartiallyFilled"
    );
  });
  if (filledOrder) {
    // when take profit order filled, order type can only be market -> no partially filled
    if (filledOrder.stopOrderType === "PartialTakeProfit") {
      const config = await Config.findOne({
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

        setTimeout(async () => {
          const contractClient = new ContractClient({
            key: API_KEY,
            secret: API_SECRET,
            testnet: TEST_NET,
          });

          const getClosedProfitAndLossResult =
            await contractClient.getClosedProfitAndLoss({
              symbol: config.symbol,
              limit: 1,
            });
          const pnl = Number.parseFloat(
            getClosedProfitAndLossResult.result.list[0].closedPnl
          );
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
          const newMessage = `
                  ${filledOrder.symbol} - ${orderType} | ${
            pnl > 0 ? "WIN" : "LOSE"
          }
                  Bot:...
                  ${config.winCount} WINS, ${config.loseCount} LOSES
                  Buy price: ${
                    orderType === "Long" ? entryPrice : exitPrice
                  }, amount: ${orderType === "Long" ? entryAmount : exitAmount}
                  Sell price: ${
                    orderType === "Short" ? entryPrice : exitPrice
                  }, amount: ${orderType === "Long" ? entryAmount : exitAmount}
                  PNL: $${pnl} ~ ${pnlPercentage.toFixed(4)}%
                `;
          notify(newMessage);
        }, 5000);

        config.orderId = "";
        config.tpOrderId = "";
        await config.save();
      }
    }
    // when limit order filled, can be partially filled
    else {
      const tpOrder = data[1];
      const config = await Config.findOne({ orderId: filledOrder.orderId });

      if (config) {
        const side = filledOrder.side === "Buy" ? "OpenLong" : "OpenShort";
        const message = `
          ${filledOrder.symbol} | ${side}
          Bot:...
          Futures | Min${config.interval} | OC: ${config.oc}% | TP: ${
          config.tp
        }%
          Status: ${filledOrder.leavesQty !== "0" ? "Incompleted" : "Completed"}
          Price: ${filledOrder.avgPrice}, amount: ${filledOrder.cumExecValue}
        `;
        notify(message);
        config.tpOrderId = tpOrder.orderId;
        await config.save();
      }
    }
  }
};

const notify = (message: string) => {
  telegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID || "", message);
};

const bot = async () => {
  configWebsocket();
};

export default bot;
