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
    const config = {...req.body, _id: Date.now().toString()}
    const newConfigs = [...configs, config]
    const contractClient = new ContractClient({
      key: process.env.API_KEY,
      secret: process.env.API_SECRET,
      testnet: Boolean(process.env.TEST_NET),
    });
    const setPositionModeResult = await contractClient.setPositionMode({
      symbol: config.symbol,
      mode: 3,
    });
    if (setPositionModeResult.retCode !== 0) {
        console.error(
          `ERROR set position mode`,
          JSON.stringify(setPositionModeResult, null, 2)
        );
      }
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
    if (indexToDelete === -1) {
      console.log(`failed to delete ${id}`)
      return;
    }
    const deletedConfig = configs.splice(indexToDelete, 1)[0]
    console.log("🚀 ~ file: configs.ts:40 ~ deleteConfig ~ configs:", configs)

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
      if (cancelOrderResult.retMsg !== "OK") {
        console.error(
          `delete config`,
          `ERROR cancel order: ${deletedConfig.orderId}`,
          JSON.stringify(cancelOrderResult, null, 2)
        );
      } else {
        console.log(
          `delete config`,
          `SUCCESS cancel order: ${deletedConfig.orderId}`,
          JSON.stringify(cancelOrderResult, null, 2)
        );
      }
    }
    writeConfigs(configs)
    bot();
    res.status(200).json(deletedConfig);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
