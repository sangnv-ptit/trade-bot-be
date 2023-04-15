import { ContractClient } from "bybit-api";
import Config from "./models/Config";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config()
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const TEST_NET = Boolean(process.env.TEST_NET);


// get config
// get open price
async function main() {
  await mongoose.connect(process.env.MONGO_URL || "")
  const configs = await Config.find({})
  const now = new Date()
  configs.forEach(async (config) => {
    const contractClient = new ContractClient({
      key: API_KEY,
      secret: API_SECRET,
      testnet: TEST_NET,
    })

    const symbol = config.symbol
    const orderId = config.orderId
    // if (now.getSeconds() === 0) {
      if (config.orderId) {
        const getHistoricOrdersResult = await contractClient.getHistoricOrders({ symbol, orderId, limit: 1 })
        const order = getHistoricOrdersResult.result.list[0]
        console.log("🚀 ~ file: trade-bot.ts:31 ~ configs.forEach ~ order:", order)
        if (order.orderStatus === 'Filled') {
          return;
        } else if (order.orderStatus === 'Cancelled') {

        } else {
          const cancelOrderResult = await contractClient.cancelOrder({
            symbol,
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
            config.orderId = "";
            await config.save();
            return;
          }
        }
      }
    // } else {
    //   if (orderId) return;
    // }

    const currentTimestamp = now.getTime();
    const twoMinAgo = currentTimestamp - (60 * 2000);

    const interval = config.interval
    const getCandlesResult = await contractClient.getCandles({
      category: "linear",
      symbol,
      interval,
      start: twoMinAgo,
      end: currentTimestamp,
      limit: 1,
    })
    const openPrice = parseFloat(getCandlesResult.result.list[0][1])
    console.log("🚀 ~ file: trade-bot.ts:37 ~ configs.map ~ openPrice:", openPrice)

    // get last price
    const getSymbolTickerResult = await contractClient.getSymbolTicker(
      "linear",
      symbol
    )
    const lastPrice = parseFloat(getSymbolTickerResult.result.list[0].lastPrice)
    console.log("🚀 ~ file: trade-bot.ts:45 ~ configs.map ~ lastPrice:", lastPrice)

    const oc = config.oc / 100;
    const gap = openPrice * (oc + (config.extend / 100));
    const buyConditionPrice = openPrice - gap;
    console.log("🚀 ~ file: trade-bot.ts:59 ~ configs.forEach ~ buyConditionPrice:", buyConditionPrice)
    const sellConditionPrice = openPrice + gap;
    const tp = config.tp / 100;
    const tradeType = config.tradeType;
    if (lastPrice < buyConditionPrice && tradeType !== "short") {
      const limitPrice = openPrice - openPrice * oc;
      const tpPrice = limitPrice + (openPrice - limitPrice) * tp;
      const qty = config.amount / limitPrice;

      // call API to submit buy limit order of the config
      const submitOrderResult = await contractClient.submitOrder({
        side: "Buy",
        symbol,
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
    } else if (lastPrice > sellConditionPrice && tradeType !== "short") {
      const limitPrice = openPrice + openPrice * oc;
      const tpPrice = limitPrice - (limitPrice - openPrice) * tp;
      const qty = config.amount / limitPrice;

      // call API to submit sell limit order of the config
      const submitOrderResult = await contractClient.submitOrder({
        side: "Sell",
        symbol,
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
  })
}

// main()
setInterval(main, 1000)