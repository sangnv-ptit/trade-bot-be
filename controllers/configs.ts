import Config from "../models/Config";
import bot from "../bot";
import { ContractClient } from "bybit-api";

export const getConfigs = async (req: any, res: any) => {
  try {
    const configs = await Config.find({});
    res.status(200).json(configs);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const createConfig = async (req: any, res: any) => {
  try {
    let config = new Config(req.body);
    await config.save();
    bot();
    res.status(200).json(config);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteConfig = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const config = await Config.findByIdAndDelete(id);
    const contractClient = new ContractClient({
      key: process.env.API_KEY,
      secret: process.env.API_SECRET,
      testnet: Boolean(process.env.TEST_NET),
    });

    if (!config) return;
    if (config.orderId && !config.tpOrderId) {
      // call API to cancel an order by orderId
      const cancelOrderResult = await contractClient.cancelOrder({
        symbol: config.symbol,
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
    }
    bot();
    res.status(200).json(config);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
