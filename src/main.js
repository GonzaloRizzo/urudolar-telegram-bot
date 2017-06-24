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

const config = require('../config/config')
let lastCurrency = require('../config/cache')

error.enable = true
moment.locale('es')

if (!(config['telegram_token'] && config['target'])) {
  error('Invalid config.json')
  process.exit(1)
}

const bot = new TelegramBot(config.telegram_token)

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

async function checkCurrency () {
  const currency = await getCurrency()
  debug('Downloaded currency: %O', currency)
  debug('Cached currency:     %O', lastCurrency)

  if (
    currency.bidRate !== lastCurrency.bidRate ||
    currency.askRate !== lastCurrency.askRate
  ) {
    debug('Diff found!')
    logger({timestamp: new Date(), currency: currency})
    let bidDiff = currency.bidRate - lastCurrency.bidRate || 0
    let askDiff = currency.askRate - lastCurrency.askRate || 0

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
    const template = await fs.readFile('template.ejs', 'utf-8')
    const msg = ejs.render(template, context)

    debug('Sending update to %d', config.target)
    await bot.sendMessage(config.target, msg, {
      parse_mode: 'HTML'
    })

    debug('Caching currency')
    lastCurrency = currency
    await fs.writeFile(
      '../config/cache.json', JSON.stringify(lastCurrency, null, 4)
    )
  }
}

checkCurrency()
setInterval(checkCurrency, config.interval || 5 * 60 * 1000)
