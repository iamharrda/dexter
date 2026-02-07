
import { Bot, Context } from 'grammy';
import { config } from 'dotenv';
import { Agent } from './agent/agent.js';
import { InMemoryChatHistory } from './utils/in-memory-chat-history.js';
import { AgentEvent } from './agent/types.js';

// Load environment variables
config();

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables.');
  process.exit(1);
}

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Store chat history in memory (simple implementation)
// In a production app, you might want to use a database or Redis
const chatHistories = new Map<number, InMemoryChatHistory>();

function getChatHistory(chatId: number): InMemoryChatHistory {
  if (!chatHistories.has(chatId)) {
    chatHistories.set(chatId, new InMemoryChatHistory());
  }
  return chatHistories.get(chatId)!;
}

bot.command('start', (ctx) => ctx.reply('Welcome! I am Dexter, your AI agent. How can I help you today?'));

bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const history = getChatHistory(chatId);

  // Send an initial "Thinking..." message
  const statusMessage = await ctx.reply('Thinking...');
  const statusMessageId = statusMessage.message_id;

  try {
    const agent = Agent.create({
      model: 'gpt-4o', // or whatever default model you prefer
      modelProvider: 'openai',
    });

    let lastStatusUpdate = Date.now();
    let currentStatusText = 'Thinking...';

    // Helper to update status message with throttling
    const updateStatus = async (text: string, force = false) => {
      const now = Date.now();
      if (force || (now - lastStatusUpdate > 2000)) { // Update at most every 2 seconds
        try {
          if (text !== currentStatusText) {
             await ctx.api.editMessageText(chatId, statusMessageId, text);
             currentStatusText = text;
             lastStatusUpdate = now;
          }
        } catch (e) {
          // Ignore errors (e.g., message not modified)
          console.error('Failed to update message:', e);
        }
      }
    };

    const stream = agent.run(text, history);
    let finalAnswer = '';

    for await (const event of stream) {
      if (event.type === 'thinking') {
        await updateStatus(`Thinking: ${event.message}...`);
      } else if (event.type === 'tool_start') {
        await updateStatus(`Using tool: ${event.tool}...`);
      } else if (event.type === 'done') {
        finalAnswer = event.answer;
      }
    }

    // Delete the status message and send the final answer
    try {
        await ctx.api.deleteMessage(chatId, statusMessageId);
    } catch (e) {
        console.error('Failed to delete status message', e);
    }
    
    // Telegram has a 4096 character limit. Split if necessary, but for now just send.
    // If answer is too long, grammy might throw, so basic splitting:
    if (finalAnswer.length > 4000) {
        const chunks = finalAnswer.match(/.{1,4000}/g) || [finalAnswer];
        for (const chunk of chunks) {
            await ctx.reply(chunk);
        }
    } else {
        await ctx.reply(finalAnswer);
    }

  } catch (error) {
    console.error('Error handling message:', error);
    await ctx.api.editMessageText(chatId, statusMessageId, 'An error occurred while processing your request.');
  }
});

// Start the bot
bot.start({
    onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} is up and running!`);
    }
});
