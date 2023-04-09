import * as fs from 'fs';

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
    const rawData = fs.readFileSync('db.json');
    const configs: Config[] = JSON.parse(rawData.toString());
    return configs;
  }
  catch (error) {
    console.log("Error while reading json db");
    return [];
  }
};

export const writeConfigs = (configs: Config[]) => {
  try {
    const jsonData = JSON.stringify(configs);
    fs.writeFileSync('db.json', jsonData)
  }
  catch (error) {
    console.log("Error white writing json db")
  }
};

// export const updateConfigOrderId = (orderId: string) => {
//   try {
    
//   }
// }
