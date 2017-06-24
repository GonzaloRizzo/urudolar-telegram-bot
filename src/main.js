const debug = require('debug')('dolar-bot:debug')
const logger = require('debug')('dolar-bot:log')
const error = require('debug')('dolar-bot:error')
const TelegramBot = require('node-telegram-bot-api')
const emoji = require('node-emoji')
const moment = require('moment')
const fs = require('mz/fs')
const rp = require('request-promise-native')
const ejs = require('ejs')
const cheerio = require('cheerio')

error.enable = true
moment.locale('es')

let lastCurrency = {}

async function getCurrency () {
  let html
  try {
    debug('Downloading currency from Brou')
    html = await rp('https://www.portal.brou.com.uy/')
  } catch (e) {
    error('Could not download https://www.portal.brou.com.uy/')
    throw e
  }

  const $ = cheerio.load(html)

  let askRate, bidRate
  try {
    const currencyTable = $('.portlet-body > table > tbody')
    askRate = currencyTable
      .find('tr:nth-child(1) > td:nth-child(2) > div > p')
      .text()
      .trim()
      .replace(',', '.')

    bidRate = currencyTable
      .find('tr:nth-child(1) > td:nth-child(4) > div > p')
      .text()
      .trim()
      .replace(',', '.')
  } catch (e) {
    error('Could not parse html!')
    throw e
  }

  if (parseInt(askRate) && parseInt(bidRate)) {
    return { askRate, bidRate }
  } else {
    error('Not a number: %O', { askRate, bidRate })
    throw Error('Not a number')
  }
}

function getUpDownEmoji (val) {
  if (val > 0) {
    return emoji.get('arrow_upper_right')
  } else if (val < 0) {
    return emoji.get('arrow_lower_right')
  } else {
    return emoji.get('arrow_right')
  }
}

async function sendCurrency (bot, target) {
  const currency = await getCurrency()
  debug('Downloaded currency: %O', currency)
  debug('Cached currency:     %O', lastCurrency)
  if (
      currency &&
      (
        currency.bidRate !== lastCurrency.bidRate ||
        currency.askRate !== lastCurrency.askRate
      )
  ) {
    debug('Diff found!')
    logger({timestamp: new Date(), currency: currency})
    let bidDiff = currency.bidRate - lastCurrency.bidRate || 0
    let askDiff = currency.askRate - lastCurrency.askRate || 0

    lastCurrency = currency

    debug('Caching currency')
    await fs.writeFile('cache.json', JSON.stringify(lastCurrency, null, 4))

    const template = await fs.readFile('template.ejs', 'utf-8')
    const context = {
      date: moment().format('LLL'),
      emoji: {
        icon: emoji.get('moneybag'),
        ask_emoji: getUpDownEmoji(askDiff),
        bid_emoji: getUpDownEmoji(bidDiff),
      },
      ask_diff: parseFloat(askDiff).toFixed(2),
      bid_diff: parseFloat(bidDiff).toFixed(2),
      ask_rate: currency.askRate,
      bid_rate: currency.bidRate
    }

    debug('Rendering template with the following context: \n %O', context)
    const msg = ejs.render(template, context)

    try {
      debug('Sending update to %d', target)
      return await bot.sendMessage(target, msg, {
        parse_mode: 'HTML'
      })
    } catch (e) {
      error(e) // TODO: Queue to send on internet reconect
    }
  }
}

async function parseConfigFile (file) {
  try {
    return JSON.parse(await fs.readFile(file))
  } catch (e) {
    return {}
  }
}

async function main () {
  const [cache, config] = await Promise.all([
    parseConfigFile('cache.json'),
    parseConfigFile('config.json')
  ])

  if (
    cache.hasOwnProperty('askRate') &&
    cache.hasOwnProperty('bidRate')
  ) {
    lastCurrency = cache
  }

  if (
    config.hasOwnProperty('telegram_token') &&
    config.hasOwnProperty('target')
  ) {
    let bot = new TelegramBot(config.telegram_token)

    let checkUpdates = () => {
      sendCurrency(bot, config.target)
    }

    checkUpdates()
    setInterval(checkUpdates, (config.interval || 300000))
  } else {
    error('Invalid config.json')
  }
}

main()
