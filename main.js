var TelegramBot = require('node-telegram-bot-api');
var cron = require('node-cron');
var emoji = require('node-emoji');
var moment = require('moment');
var fs = require('fs')
var request = require('request');
var cheerio = require('cheerio');

/*
  TODO: Use Promises!!!
  TODO: Add logs
*/

moment.locale('es');

var bot = new TelegramBot(process.env["URUDOLAR_TOKEN"], {polling: true});

var lastValue={}

var target = '@urudolarchannel'


function getCurrency(callback){
  request("http://uy.cotizacion-dolar.com/", (error, response, html) => {
    var $ = cheerio.load(html)
    callback(error,{
      buy:  $(".cc-2b span").text().trim(),
      sell: $(".cc-3b span").text().trim()
    })
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

function sendCurrency(){
  getCurrency(function(error, currentVal){

    if (error) return console.log(error)

    if ((currentVal.sell != lastValue.sell) || (currentVal.buy != lastValue.buy)) {

      console.log("Changed!")

      sell_diff=currentVal.sell-lastValue.sell
      buy_diff=currentVal.buy-lastValue.buy
      if (!sell_diff) sell_diff=0
      if (!buy_diff) buy_diff=0

      lastValue=currentVal
      fs.writeFile("last.json", JSON.stringify(lastValue), "utf8", () =>{

        var msg =
          emoji.get('moneybag') + " <b>" + moment().format('LLL') + "</b> \n\n" +
          getUpDownEmoji(buy_diff) + " <b>Compra:</b> " + currentVal.buy  + " <b>(" + parseFloat(buy_diff).toFixed(2)  + ")</b>" + "\n" +
          getUpDownEmoji(sell_diff)  + " <b>Venta:</b> " + currentVal.sell + " <b>(" + parseFloat(sell_diff ).toFixed(2)+ ")</b>"

        var opt = {
          parse_mode: "HTML"
        }

        bot.sendMessage(target,msg, opt)
      })
    }
  })
}


  fs.readFile("last.json", "utf8", (err,data) => {
    try {

      data=JSON.parse(data)
      if (data.hasOwnProperty("buy") && data.hasOwnProperty("sell")){
        lastValue=data
      }
    }catch (SyntaxError) {
    }

    cron.schedule('*/5 * * * *', sendCurrency)
    sendCurrency()
  })


bot.on('message', function(msg){
  if(val=Number(msg.text)){
    var text =
      emoji.get('moneybag') + " <b>" + moment().format('LLL') + "</b> \n\n" +
      " <b>Dolar a Peso:</b> USD " + val + " = " + "UYU " + parseFloat(lastValue.buy*val).toFixed(2) + "\n" +
      " <b>Peso a Dolar:</b> UYU " + val + " = " + "USD " + parseFloat(val/lastValue.buy).toFixed(2)

    bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" })
  }
})
