const cookieParser = require('cookie-parser');
const session = require('express-session');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const app = express();
const port = 6789;

app.use(cookieParser());
// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views/layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client (e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body
app.use(bodyParser.json());
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));
// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'Hello World'
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res
app.get('/', (req, res) => res.render('index', { user: req.cookies.user }));
// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată

fs = require('fs');

app.get('/chestionar', (req, res) => {
    fs.readFile('intrebari.json', (err, data) => {
        if (err) {
            res.status(500).send('Eroare la citirea intrebarilor');
            return;
        }
        const listaIntrebari = JSON.parse(data);
        res.render('chestionar', { intrebari: listaIntrebari });
    });
    // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' care conține vectorul de întrebări
});

app.get('/autentificare', (req, res) => res.render('autentificare', { mesajEroare: req.cookies.mesajEroare }));

app.post('/verificare-autentificare', (req, res) => {
    console.log(req.body);
    if (req.body.user == 'admin' && req.body.password == 'admin') {
        res.cookie('user', req.body.user);
        res.redirect('/');
    }
    else {
        res.cookie('mesajEroare', 'Utilizator sau parola incorecte!');
        res.redirect('/autentificare');
    }
});

app.post('/rezultat-chestionar', (req, res) => {
    fs.readFile('intrebari.json', (err, data) => {
        if (err) {
            res.status(500).send('Eroare la citirea intrebarilor');
            return;
        }
        const listaIntrebari = JSON.parse(data);

        let corecte = 0;
        listaIntrebari.forEach((item, index) => {
            const raspuns = parseInt(req.body[`intrebare_${index}`]);
            if (raspuns === item.corect)
                corecte++;
        });

        res.render('rezultat-chestionar', {
            corecte: corecte,
            total: listaIntrebari.length
        });
    });
});

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:${port}/`));