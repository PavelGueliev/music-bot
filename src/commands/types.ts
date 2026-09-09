import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { AppContext } from "../bot/context.js";

export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface Command {
  data: CommandData;
  execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void>;
}
