const express = require('express');
const app = express();
const port = 4000;
const bodyParser = require('body-parser');
var cors = require('cors');
const db = require('./db');
const bcrypt = require('bcryptjs');
const passport = require('passport');
var Strategy = require('passport-http').BasicStrategy;

const saltRounds = 4;
app.use(bodyParser.json());
app.use(cors())

passport.use(new Strategy((username, password, cb) => {
  db.query('SELECT idUser, username, password FROM users WHERE username = ?', [username]).then(dbResults => {

    if (dbResults.length == 0) {
      return cb(null, false);
    }

    bcrypt.compare(password, dbResults[0].password).then(bcryptResult => {
      if (bcryptResult == true) {
        cb(null, dbResults[0]);
      }
      else {
        return cb(null, false);
      }
    })

  }).catch(dbError => cb(dbError))
}));
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, PATCH, POST, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.get('/getData', (req, res) => {
  db.query('SELECT * FROM stations').then(results => {
    res.json(results)
  })
    .catch(() => {
      res.sendStatus(500);
    })
});
app.get('/getUserId/:username',
  passport.authenticate('basic', { session: false }),
  (req, res) => {
    db.query('select idUser from users where username = ?', [req.params.username])
    .then(dbRes => res.send(dbRes))
    .catch(dbEr => console.log(dbEr))
  });

app.get('/signIn',
  passport.authenticate('basic', { session: false }),
  (req, res) => res.send(true));

app.get('/history/:idUser',
  passport.authenticate('basic', { session: false }),
  (req, res) => {
    db.query('SELECT charging.idCharging, charging.timeOfUsage, charging.cost, stations.type, charging.timeOfStart, stations.UUID  from charging inner join stations on charging.stationId = stations.stationId where idUser = ?', [req.params.idUser])
    .then(dbResults => {
      res.send(dbResults)
    }).catch(dbEr => console.log(dbEr))
    
  })

app.get('/stopCharging/:idCharging',
  passport.authenticate('basic', { session: false }),
  (req, res) => {
    db.query('SELECT charging.stationId from charging inner join stations on charging.stationId = stations.stationId where idCharging = ?', [req.params.idCharging])
      .then(dbResults => {
        db.query('UPDATE stations SET isTaken = 0 where stationId = ?', [dbResults[0].stationId])
          .then(res.send(true))
          .catch(dbEr => console.log(dbEr))
      }).catch(dbEr => console.log(dbEr))
  })

app.get('/startCharging/:UUID',
  passport.authenticate('basic', { session: false }),
  (req, res) => {
    db.query('SELECT stationId, measure, isTaken FROM stations WHERE UUID = ?', [req.params.UUID.toUpperCase()]).then(dbResults => {
      if (dbResults.length == 0 || dbResults[0].isTaken == true) {
        res.send(false)
      } else {
        // console.log(req.user.idUser, dbResults[0].stationId)
        db.query('INSERT INTO `charging` ( `idUser`, `stationId`, `timeOfStart`, `timeOfUsage`, `measure`, `cost`) VALUES (  ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)', [req.user.idUser, dbResults[0].stationId, 0, dbResults[0].measure, 0])
          .then(
            db.query('UPDATE `stations` SET `isTaken` = 1 WHERE `stationId` = ?', [dbResults[0].stationId])
              .then(db.query('SELECT MAX(`idCharging`) AS `id` FROM `charging`')
                .then(results => res.send(results[0]))
                .catch())
              .catch(dbEr => console.log(dbEr))
          )
          .catch(dbEr => console.log(dbEr))
      }
    }).catch(dbError => console.log(dbError))
  })
// TODO подумать над ценой быстрой зарядки
app.get('/chargingProcess/:idCharging', passport.authenticate('basic', { session: false }),
  (req, res) => {
    db.query('SELECT charging.idCharging, charging.stationId, stations.price, stations.type, TIMESTAMPDIFF(MINUTE, timeOfStart, CURRENT_TIMESTAMP()) as time from charging inner join stations on charging.stationId = stations.stationId where idCharging = ?', [req.params.idCharging]).then(dbResults => {
      if (dbResults[0].type == "Fast") {
        let currentCost = dbResults[0].time * 0.7 * dbResults[0].price;
        db.query('UPDATE `charging` SET `cost` = ?, `timeOfUsage` = ? WHERE `charging`.`idCharging` = ?', [currentCost, dbResults[0].time * 0.7, req.params.idCharging])
          .then()
          .catch(dbEr => console.log(dbEr))
      } else {
        let currentCost = dbResults[0].time * 1 * dbResults[0].price;
        db.query('UPDATE `charging` SET `cost` = ?, `timeOfUsage` = ? WHERE `charging`.`idCharging` = ?', [currentCost, dbResults[0].time * 1, req.params.idCharging])
          .then()
          .catch(dbEr => console.log(dbEr))
      }
      db.query('SELECT cost, timeOfUsage from charging where idCharging = ?', [req.params.idCharging])
        .then(dbRes => res.send(dbRes))
        .catch(dbEr => console.log(dbEr))
    })
      .catch(dbEr => console.log(dbEr))
  })

app.post('/signUp', (req, res) => {
  let username = req.body.username.trim();
  let password = req.body.password.trim();
  let email = req.body.email.trim();
  if ((typeof username === "string") &&
    (username.length > 3) &&
    (typeof password === "string") &&
    (password.length > 3)) {
    bcrypt.hash(password, saltRounds).then(hash =>
      db.query('INSERT INTO users (username, password, email) VALUES (?,?,?)', [username, hash, email])
    )
      .then(dbResults => {
        console.log(dbResults);
        res.sendStatus(201);
      })
      .catch(error => res.sendStatus(500));
  }
  else {
    console.log("incorrect username or password, both must be strings and username more than 4 long and password more than 6 characters long");
    res.sendStatus(400);
  }
});

app.patch('/changeData', (req, res) => {
  //  отправлять промисы после выполнения лупы
  let data = req.body;
  Promise.all([
    data.forEach(element => {
      db.query('UPDATE data SET name = (?), description = (?) , company = (?), price = (?), currency = (?), ship = (?), image = (?) WHERE data.id =(?)', [element.name, element.description, element.company, element.price, element.currency, element.ship, element.image, element.id])
    })]
  ).then((response) => {
    res.send('succesfull');
  })
    .catch((err) => {
      console.log(err);
      // res.send(err);
    })
});
// Do not accept "delete" request

Promise.all(
  [
    db.query("CREATE TABLE IF NOT EXISTS charging ( `idCharging` INT NOT NULL AUTO_INCREMENT , `idUser` INT NOT NULL , `stationId` INT NOT NULL , `timeOfStart` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP , `timeOfUsage` INT NOT NULL , `cost` varchar(50) NOT NULL, `measure` TEXT NOT NULL ,  INDEX (`idUser`), INDEX (`stationId`), PRIMARY KEY (`idCharging`)) ENGINE = InnoDB "),
    db.query("CREATE TABLE IF NOT EXISTS stations(`stationId` INT NOT NULL AUTO_INCREMENT , `stationName` TEXT NOT NULL , `address` TEXT NOT NULL ,`lat` float(50) NOT NULL , `lng` float(50) NOT NULL, `type` varchar(50) NOT NULL , `price` varchar(50) NOT NULL , `measure` TEXT NOT NULL , `isTaken` BOOLEAN NOT NULL DEFAULT FALSE, `UUID` VARCHAR(4) NOT NULL, PRIMARY KEY (`stationId`))"),
    db.query("CREATE TABLE IF NOT EXISTS users ( `idUser` INT NOT NULL AUTO_INCREMENT , `username` varchar(50) NOT NULL , `email` varchar(50) NOT NULL , `password` varchar(512) NOT NULL , PRIMARY KEY (`idUser`))"),
    db.query("ALTER TABLE `charging` ADD FOREIGN KEY (`idUser`) REFERENCES `users`(`idUser`) ON DELETE CASCADE ON UPDATE CASCADE;"),
    db.query("ALTER TABLE `charging` ADD FOREIGN KEY (`stationId`) REFERENCES `stations`(`stationId`) ON DELETE CASCADE ON UPDATE CASCADE;")
    // Add more table create statements if you need more tables
  ]
).then(() => {
  console.log('database initialized');
  app.listen(port, () => {
    console.log('Listening to port ', port)

  });
});

app.post('/addData', (req, res) => {
  //  отправлять промисы после выполнения лупы
  let data = req.body;
  Promise.all([
    data.forEach(element => {
      db.query('INSERT INTO stations (stationName, address, lat, lng, type, price, measure, UUID) VALUES (?,?,?,?,?,?,?,?)', [element.stationName, element.address, element.lat, element.lng, element.type, element.price, element.measure, element.UUID])
    })]
  ).then((response) => {
    res.send('succesfull');
  })
    .catch((err) => {
      console.log(err);
      // res.send(err);
    })
});
// CREATE TABLE `map`.`charging` ( `idCharging` INT NOT NULL AUTO_INCREMENT , `idUser` INT NOT NULL , `stationId` INT NOT NULL , `timeOfStart` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP , `timeOfUsage` INT NOT NULL , INDEX (`idUser`), INDEX (`stationId`), PRIMARY KEY (`idCharging`)) ENGINE = InnoDB;
// ALTER TABLE `charging` ADD FOREIGN KEY (`idUser`) REFERENCES `users`(`idUser`) ON DELETE CASCADE ON UPDATE CASCADE;
// ALTER TABLE `charging` ADD FOREIGN KEY (`stationId`) REFERENCES `stations`(`stationId`) ON DELETE CASCADE ON UPDATE CASCADE;
//db.query('INSERT INTO `charging` (`idCharging`, `idUser`, `stationId`, `timeOfStart`, `timeOfUsage`) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?))'.then(results => {
  // db.query('SELECT TIMESTAMPDIFF(MINUTE, timeOfStart, CURRENT_TIMESTAMP()) from charging where idCharging = 101', [])
  //       .then(results => { res.send(results)})
  //       .catch()
// SELECT charging.stationId, stations.price, charging.idCharging from charging inner join stations on charging.stationId = stations.stationId where idCharging = 1