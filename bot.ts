import * as dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import Config from "./models/Config";
import { ContractClient, WebsocketClient } from "bybit-api";

dotenv.config();
// const telegramApiToken =
//   process.env.TELEGRAM_API_TOKEN ||
//   "6196940320:AAGbgvosV3v1SSwPOXVt1bMOExTyTKZH2Zg";
// const telegramBot = new TelegramBot(telegramApiToken, { polling: true });

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

    const setPositionModeResult = await contractClient.setPositionMode({ coin: 'USDT', mode: 3 });
    if (setPositionModeResult.retMsg !== "OK") {
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
    // wsClient.on('error', (err) => {
    //   console.error('error', err);
    // });

    // TODO: query distincy symbols, eg: const configs = await Config.distinct('symbol');
    const configs = await Config.find();
    configs.map((config: any) => {
      // TODO: unsubscribe redundant topics
      wsClient.subscribe([
        `kline.${config.interval}.${config.symbol}`,
        `tickers.${config.symbol}`,
      ]);
    });
    wsClient.subscribe([
      `user.execution.contractAccount`,
      `user.order.contractAccount`,
    ]);
  } catch (error) {
    console.error(`Unexpected error: `, error);
  }
};

const handleUpdate = async (data: any) => {
  try {
    if (data.topic.startsWith("tickers.")) {
      const symbol = data.data.symbol;
      const configs = await Config.find({ symbol: symbol });
      if (configs.length == 0) {
        console.log(`no config for symbol: ${symbol}`);
        return;
      }

      const currentPrice = data.data.lastPrice;
      if (!currentPrice) return;

      configs.map(async (config) => {
        const contractClient = new ContractClient({
          key: API_KEY,
          secret: API_SECRET,
          testnet: TEST_NET,
        });

        // call AP to set TP mode to Partial for the symbol of the config
        const setTPSLModeResult = await contractClient.setTPSLMode(
          symbol,
          "Partial"
        );
        // if (setTPSLModeResult.retMsg !== "OK") {
        //   console.error(
        //     `ERROR set TP mode symbol: ${symbol}`,
        //     JSON.stringify(setTPSLModeResult, null, 2)
        //   );
        //   return;
        // }

        // stop if confif already had an active order
        if (config.orderId) return;

        const openPrice = symbolOpenPriceMap[config.interval][symbol];
        if (!openPrice) return;

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
            config.orderId = submitOrderResult.result.orderId;
            await config.save();
          }
        } else if (currentPrice > sellConditionPrice && tradeType !== "long") {
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
      });
    } else if (data.topic.startsWith("kline.")) {
      const closedTicker = data.data.find((ticker: any) => ticker.confirm);
      if (!closedTicker) return;

      const [_, interval, symbol] = data.topic.split(".");
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

      // call API cancel all orders of symbol
      // const cancelAllOrdersResult = await contractClient.cancelAllOrders(
      //   symbol
      // );
      // if (cancelAllOrdersResult.retMsg !== "OK") {
      //   console.error(
      //     `ERROR cancel orders: `,
      //     JSON.stringify(cancelAllOrdersResult, null, 2)
      //   );
      //   return;
      // }

      configs.map(async (config) => {
        const contractClient = new ContractClient({
          key: API_KEY,
          secret: API_SECRET,
          testnet: TEST_NET,
        });
        if (!config.orderId) return;
        // call API to cancel an order by orderId
        if (!config.tpOrderId) {
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
          }
        } else {
          // const longPosition = getPositionsResult.result.list[0];
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
            if (currentTime - tpOrderCreatedTime < 120) {
              console.log(
                "🚀 ~ file: bot.ts:251 ~ configs.map ~ tpOrderCreatedTime:",
                new Date(tpOrderCreatedTime)
              );
              console.log(
                "🚀 ~ file: bot.ts:251 ~ configs.map ~ currentTime:",
                new Date(currentTime)
              );
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
      // } else if (data.topic === `user.execution.contractAccount`) {
      //   console.log("🚀 ~ file: bot.ts:311 ~ handleUpdate ~ data:", data.data)
      //   const filledOrder = data.data.find((item: any) => {
      //     return item.leavesQty === '0' && item.lastLiquidityInd === 'RemovedLiquidity'
      //   })
      //   if (!filledOrder) return;
      //   const config = await Config.findOne({ orderId: filledOrder.orderId })
      //   if (!config) return;
      //   config.orderId = ''
      //   await config.save()
      //   // telegramBot.sendMessage("1003344491", message);
    } else if (data.topic === `user.order.contractAccount`) {
      // console.log("🚀 ~ file: bot.ts:319 ~ handleUpdate ~ data:", data.data);

      const cancelledOrder = data.data.find((item: any) => {
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

      const filledOrder = data.data.find((item: any) => {
        return item.orderStatus === "Filled";
      });
      if (filledOrder) {
        if (filledOrder.stopOrderType === "PartialTakeProfit") {
          const config = await Config.findOne({
            tpOrderId: filledOrder.orderId,
          });

          if (config) {
            config.orderId = "";
            config.tpOrderId = "";
            await config.save();
          }
        } else {
          const tpOrder = data.data[1];
          const config = await Config.findOne({ orderId: filledOrder.orderId });

          if (config) {
            config.tpOrderId = tpOrder.orderId;
            await config.save();
          }
        }
      }
    }
  } catch (error) {
    console.error(`Unexpected error: `, error);
  }
};

const bot = async () => {
  configWebsocket();
};

export default bot;
