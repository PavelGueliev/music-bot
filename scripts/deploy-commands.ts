import { REST, Routes } from "discord.js";
import { env } from "../src/config/env.js";
import { commandList } from "../src/commands/index.js";

const body = commandList.map((c) => c.data.toJSON());

const rest = new REST().setToken(env.DISCORD_TOKEN);

async function main() {
  if (env.DISCORD_DEV_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_DEV_GUILD_ID), { body });
    console.log(`Зарегистрировано ${body.length} команд на dev-сервере ${env.DISCORD_DEV_GUILD_ID} (мгновенно).`);
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
    console.log(`Зарегистрировано ${body.length} команд глобально (обновление до ~1 часа).`);
  }
}

main().catch((error) => {
  console.error("Не удалось зарегистрировать команды:", error);
  process.exit(1);
});
