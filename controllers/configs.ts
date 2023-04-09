import Config from "../models/Config";
import bot from "../bot";
import { ContractClient } from "bybit-api";
import { readConfigs, writeConfigs } from "../models/config-json";

export const getConfigs = async (req: any, res: any) => {
  try {
    // const configs = await Config.find({});
    const configs = readConfigs()
    res.status(200).json(configs);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const createConfig = async (req: any, res: any) => {
  try {
    // const config = new Config(req.body);
    // await config.save();
    // bot();
    const configs = readConfigs()
    const config = {...req.body, _id: Date.now()}
    const newConfigs = [...configs, config]
    console.log("🚀 ~ file: configs.ts:24 ~ createConfig ~ config:", config)
    writeConfigs(newConfigs)
    bot();
    res.status(200).json(config);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteConfig = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    // const config = await Config.findByIdAndDelete(id);
    const configs = readConfigs();
    const indexToDelete = configs.findIndex(config => config._id === id)
    const deletedConfig = configs.splice(indexToDelete, 1)[0]

    if (!deletedConfig) return;
    if (deletedConfig.orderId && !deletedConfig.tpOrderId) {
      // call API to cancel an order by orderId
      const contractClient = new ContractClient({
        key: process.env.API_KEY,
        secret: process.env.API_SECRET,
        testnet: Boolean(process.env.TEST_NET),
      });
      const cancelOrderResult = await contractClient.cancelOrder({
        symbol: deletedConfig.symbol,
        orderId: deletedConfig.orderId,
      });
      // if (cancelOrderResult.retMsg !== "OK") {
      //   console.error(
      //     `ERROR cancel order: ${deleteConfig.orderId}`,
      //     JSON.stringify(cancelOrderResult, null, 2)
      //   );
      //   return;
      // } else {
      //   console.log(
      //     `SUCCESS cancel order: ${config.orderId}`,
      //     JSON.stringify(cancelOrderResult, null, 2)
      //   );
      // }
    }
    writeConfigs(configs)
    bot();
    res.status(200).json(deletedConfig);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
