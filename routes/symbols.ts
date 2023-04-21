import express, { Router, Request, Response } from "express";
import { ContractClient } from "bybit-api";


const router: Router = express.Router();

const TEST_NET = Boolean(process.env.TEST_NET)

router.get('/', async (req: Request, res: Response) => {
  try {
    const restClient = new ContractClient({
      key: process.env.API_KEY,
      secret: process.env.API_SECRET,
      testnet: TEST_NET,
    });
    const symbolsResult = await restClient.getSymbolTicker('linear')
    if (symbolsResult.retMsg !== 'OK') {
      console.error(
        `ERROR get symbols: `,
        JSON.stringify(symbolsResult, null, 2),
      );
    }
    res.status(200).send(symbolsResult.result.list.map((symbol) => symbol.symbol))
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
})

export default router;
