const utils = {
  getRandomNumber: (module = 10) => Math.floor(Math.random() * module)
}

class Console{
  static info(msg){
    console.log(`\x1b[34m${msg}\x1b[0m`);
  }

  static success(msg){
    console.log(`\x1b[32m${msg}\x1b[0m`);
  }

  static error(msg){
    console.log(`\x1b[31m${msg}\x1b[0m`);
  }

  static warning(msg){
    console.log(`\x1b[33m${msg}\x1b[0m`);
  }
}

class Client{
  constructor(name, rejectTime = 5){
    this.name = name;
    this.connected = false;
    this.rejectTime = rejectTime;
  }

  async connect(){
    if (this.connected) return;
    console.log(`[${this.name}] :: Connecting to database...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.connected = true;
    console.log(`[${this.name}] :: Connected.`)
  }

  async query(sql) {
    if (!this.connected) throw new Error(`[${this.name}] Cannot execute query. Not connected.`);
    const time = utils.getRandomNumber();
    Console.warning(`[${this.name}] Executing query: ${sql}, execution time is: ${time}`);
    return new Promise((resolve, reject) => {
      const rejectTimerId = setTimeout(reject, this.rejectTime, new Error("Query aborted due timer"))
      setTimeout(data => {
        console.log(`[${this.name}] Query completed.`);
        clearTimeout(data.rejectTimerId);
        resolve(data);
      }, time, { rows: [{ id: 1, name: "Sample Data" }], rowCount: 1, rejectTimerId });
    });
  }

  async disconnect() {
    console.log(`[${this.name}] Disconnecting from database...`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.connected = false;
    console.log(`[${this.name}] Disconnected.`);
  }
}

class Pool{
  #instances =[];
  #free = [];
  #queue = [];
  #available = 0;
  #current = 0;
  #size = 0;
  constructor(factory = null, size = 0){
    this.#size = size;
    this.#instances = new Array(size);
    this.#free = new Array(size).fill(true);
    this.#available = size;
    for(let i=0; i < size; i++){
      this.#instances[i] = factory();
    }
  }

  async next() {
    if (this.#available === 0) {
      return new Promise((resolve, reject) => {
        this.#queue.push(resolve);
      });
    }
    let free = false;
    let instance = null;
    do {
      free = this.#free[this.#current];
      instance = this.#instances[this.#current];
      this.#current++;
      if (this.#current === this.#size) this.#current = 0;
    } while (!instance || !free)
    return instance;
  }

  async getInstance() {
    const instance = await this.next();
    if (!instance) return null;
    const index = this.getInstanceIndex(instance);
    this.#free[index] = false;
    this.#available--;

    return instance;
  }

  async release(instance) {
    const index = this.getInstanceIndex(instance);
    this.validateFreeInstance(index);
    this.#free[index] = true;
    this.#available++;

    if (this.#queue.length > 0) {
      const resolve = this.#queue.shift();
      if (resolve) setTimeout(resolve, 0, instance);
    }
  }

  getInstanceIndex(instance) {
    const index = this.#instances.indexOf(instance);
    if (index < 0) throw new Error('Pool: release unexpected instance');
    return index;
  }

  validateFreeInstance(index){
    if (this.#free[index]) throw new Error('Pool: release not captured');
  }
}


// using

const factory = (() => {
  let index = 0;
  return () => new Client(`Client${++index}`);
})();

const connectionCount = 5;

const main = async () => {
  const pool = new Pool(factory, connectionCount);
  
  // emulate incomming requests to get some date from the DB
  for(let i=1; i<11; i++){
    Console.info(`[Request ${i}] << recieved...`)
    const dbClient = await pool.getInstance();
    if (!dbClient.connected) await dbClient.connect();
    dbClient.query(`Select * from table_${i};`)
    .then(res => {
      Console.success(`[Request ${i}] >> returned data: `);
      pool.release(dbClient);
    })
    .catch(error => {
      Console.error(`[Error] :: Request ${i}, got an error: "${error.message}"`);
      pool.release(dbClient);
    });
  }
}

main();