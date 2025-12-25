# Discord Bots Project

## Overview

This project contains three Discord bots built with discord.js v14:

1. **Ticket Bot** - A ticket system with 4 ticket types (complaints, compensation, transfer, admin complaints) featuring interactive buttons and role-based permissions
2. **Review Bot** - A star rating system with statistics tracking and dedicated review channels
3. **Activity Monitor Bot** - Tracks member activity in voice channels, calculating time spent and generating activity reports

The bots are designed to run together on a single Node.js process with an HTTP health check server for deployment on platforms like Render.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Multi-Bot Architecture
- **Single Entry Point**: `index.js` initializes all three bots and creates an HTTP server for health checks
- **Modular Bot Files**: Each bot has its own client instance (`client.js` for ticket/review bots, `activity-bot.js` for activity bot)
- **Shared Configuration**: `tokens.js` centralizes all bot tokens and settings using environment variables

### Discord.js Client Structure
- Uses discord.js v14 with Gateway Intents for specific permissions per bot
- Each bot maintains its own Collections/Maps for state management:
  - Ticket bot: active tickets, admin roles, log channels, cooldowns
  - Review bot: review stats, review channels
  - Activity bot: voice activity tracking, selected channels, tracking status

### HTTP Health Check Server
- Built-in HTTP server on configurable PORT (default 10000)
- Exposes `/health` and `/` endpoints returning JSON status of all bots
- Required for deployment platforms that need health monitoring

### Command Registration
- Uses Discord Slash Commands via REST API
- Commands are registered per bot with SlashCommandBuilder
- Supports both Arabic and English command names

## External Dependencies

### Discord API
- **discord.js v14.22.1** - Primary library for Discord bot functionality
- Requires bot tokens from Discord Developer Portal for each of the three bots

### Environment Variables Required
| Variable | Purpose |
|----------|---------|
| `REMINDER_BOT_TOKEN` | Token for the ticket bot |
| `REVIEW_BOT_TOKEN` | Token for the review bot |
| `ACTIVITY_BOT_TOKEN` | Token for the activity monitor bot |
| `PORT` | HTTP server port (optional, defaults to 10000) |
| `REVIEW_CHANNEL_ID` | Default review channel (optional) |

### Deployment Platform
- Designed for Render.com deployment
- Requires Node.js >= 18.0.0
- No database - all state is in-memory (resets on restart)