import Interaction from "./utils/Interaction";
import express, { Request as Req, Response as Res } from "express";
import {readdirSync} from "node:fs";
import { InteractionType, InteractionResponseType, verifyKey } from "discord-interactions";
import { EventEmitter } from "node:events";
const config = (await import("./config.json", {assert: {type: "json"}})).default;
class Client extends EventEmitter {
  webserver: any;
  commands: Map<string, any>;
  config: any;
  constructor() {
    super();
    this.webserver = express();
    this.commands = new Map();
    this.config = config;
  }
  async request(route: string, data: any){
    const req = await fetch(`https://discord.com/api/v10/${route}`, {method: data.method, headers: {...data.headers, "Content-Type": "application/json", authorization: this.config.token}});
    return await req.json();
  }
  async initialize(): Promise<Boolean> {
    this.webserver.use(express.json({ verify: (req: Req, res: Res, buf: Buffer) => {
      const signature = req.get('X-Signature-Ed25519');
      if(!signature) return;
      const timestamp = req.get('X-Signature-Timestamp');
      if(!timestamp) return;
      const isValidRequest = verifyKey(buf, signature, timestamp, config.PUBLIC_KEY);
      if (!isValidRequest) {
        res.status(401).send('Bad request signature');
      }
    }}));
    const commandFiles = readdirSync('./commands').filter((file: string) => file.endsWith('.ts'));
    commandFiles.forEach(async (file: string)=>{
        const command = (await import(`./commands/${file}`)).default;
        this.commands.set(command.data.name, command);
    });
    const listener = this.webserver.listen(5600, async () => {
      console.log(`Listening at port: ${listener.address().port}`)
    });
    this.webserver.post("/interactions", async (req: Req, res: Res) => {
      console.log(req.body)
      if(req.body.type === InteractionType.PING) return res.send({type: InteractionResponseType.PONG});
      this.emit("interaction", new Interaction(req, res, this));
    });
    return true;
  }
}
export default Client;
const client = new Client();
client.initialize();
client.on("interaction", async (interaction: Interaction) => {
  const cmd = client.commands.get(interaction.commandName as string);
  if(!cmd) return;
  cmd.execute(interaction);
});
process.on("uncaughtException", async (error) => console.log(error));
