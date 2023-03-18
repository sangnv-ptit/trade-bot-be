import Config from "../models/Config";
import bot from "../bot";

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
    bot();
    res.status(200).json(config);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
