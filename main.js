var TelegramBot = require('node-telegram-bot-api');
var emoji = require('node-emoji');
var moment = require('moment');
var fs = require("mz/fs");
var rp = require('request-promise-native');
var cheerio = require('cheerio');

moment.locale('es');

var lastValue={}

function getCurrency(callback){
  return new Promise((resolve, reject)=>{
    rp("http://uy.cotizacion-dolar.com/")
    .then((html)=>{
      var $ = cheerio.load(html)
      resolve({
        buy:  $(".cc-2b span").text().trim(),
        sell: $(".cc-3b span").text().trim()
      })
    })
    .catch(reject)
  })
}

function getUpDownEmoji(val){
  if (val>0){
    return emoji.get('arrow_upper_right')
  }else if (val<0){
    return emoji.get('arrow_lower_right')
  }else{
    return emoji.get('arrow_right')
  }
}

function sendCurrency(bot, target){
  return getCurrency()
  .then((currentVal) => {
    if ((currentVal.sell != lastValue.sell) || (currentVal.buy != lastValue.buy)) {
console.log(JSON.stringify({timestamp:Date.now(),currency:currentVal}))
      var sell_diff = currentVal.sell - lastValue.sell
      var buy_diff = currentVal.buy - lastValue.buy
      if (!sell_diff) sell_diff=0
      if (!buy_diff) buy_diff=0

      lastValue=currentVal

      fs.writeFile("cache.json", JSON.stringify(lastValue, null, 4))
      .then(()=>{

        var msg =
          emoji.get('moneybag') + " <b>" + moment().format('LLL') + "</b> \n\n" +
          getUpDownEmoji(buy_diff) + " <b>Compra:</b> " + currentVal.buy  + " <b>(" + parseFloat(buy_diff).toFixed(2)  + ")</b>" + "\n" +
          getUpDownEmoji(sell_diff)  + " <b>Venta:</b> " + currentVal.sell + " <b>(" + parseFloat(sell_diff ).toFixed(2)+ ")</b>"

        var opt = {
          parse_mode: "HTML"
        }

        return bot.sendMessage(target, msg, opt)

      })
    }
  })
}


Promise.all([fs.readFile("cache.json"), fs.readFile("config.json")])
.then(([cache_file, config_file]) => {

  var cache = {}
  var config = {}

  try {
    cache = JSON.parse(cache_file)
    config = JSON.parse(config_file)
  } catch (SyntaxError) {}

  if (cache.hasOwnProperty("buy") && cache.hasOwnProperty("sell")){
    lastValue = cache
  }


  if (config.hasOwnProperty("telegram_token") && config.hasOwnProperty("target")){
    var bot = new TelegramBot(config.telegram_token);

    var send = function (){
      sendCurrency(bot, config.target)
    }

    send()
    setInterval(send, 5000)

  }else{
    console.log("Invalid config.json")
  }

})
