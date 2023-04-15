import fs from 'fs';

const filePath = 'db.json';

interface Config {
  _id: string,
  symbol : string,
  tradeType : string,
  amount: number,
  type : number,
  oc : number,
  interval : string,
  extend : number,
  tp : number,
  autoOC : number,
  reduceMode : string,
  reduce : number,
  ignore : number,
  orderId : string,
  tpOrderId : string,
  winCount : number,
  loseCount : number,
}

export const readConfigs = (): Config[] => {
  try {
    const rawData = fs.readFileSync(filePath);
    const configs: Config[] = JSON.parse(rawData.toString());
    return configs;
  }
  catch (error) {
    console.log("Error while reading json db", error);
    return [];
  }
};

export const writeConfigs = (configs: Config[]) => {
  try {
    const jsonData = JSON.stringify(configs, null, 2);
    fs.writeFileSync(filePath, jsonData)
  }
  catch (error) {
    console.log("Error white writing json db")
  }
};

// export const updateConfigOrderId = (orderId: string) => {
//   try {

//   }
// }
