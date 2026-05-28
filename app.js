const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const session = require('express-session');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fs = require('fs');
const app = express();
const port = 6789;

const loginAttempts = new Map();
const notFoundAttempts = new Map();

app.use(cookieParser());

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false
    }
}));

//middleware care face datele utilizatorului din sesiune disponibile în toate view-urile
app.use((req, res, next) => {
    res.locals.sessionUser = req.session.user;
    next();
});

//middleware care genereaza un token si il pune disponibil in toate view-urile
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
});

function checkLoginRateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || { count: 0, blockedUntil: 0, cooldown: 15 * 60 * 1000 };

    if (attempts.blockedUntil > now) {
        const minutes = Math.ceil((attempts.blockedUntil - now) / 60000);
        return res.render('autentificare', {
            mesajEroare: `Prea multe încercări. Încearcă din nou în ${minutes} minute.`
        });
    }
    next();
}

function validateCsrf(req, res, next) {
    if (req.body._csrf !== req.session.csrfToken)
        return res.status(403).send('403 Forbidden');
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user)
        return res.status(401).send('Neautentificat');
    if (req.session.user.rol !== 'ADMIN')
        return res.status(403).send('403 Forbidden');
    next();
}
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
app.get('/', (req, res) => {
    const db = new Database('cumparaturi.db');
    let fruits = [];
    try {
        fruits = db.prepare('SELECT * FROM fruits').all();
    } catch (e) { }
    db.close();
    res.render('index', { user: req.cookies.user, fruits: fruits });
});
// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată

const utilizatori = JSON.parse(fs.readFileSync('utilizatori.json', 'utf8'));
let modificat = false;
for (const u of utilizatori) {
    if (!u.parola.startsWith('$2b$')) {
        u.parola = bcrypt.hashSync(u.parola, 10);
        modificat = true;
    }
}
if (modificat) {
    fs.writeFileSync('utilizatori.json', JSON.stringify(utilizatori, null, 4));
}

function sanitize(input) {
    if (typeof input !== 'string')
        return '';
    return input.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function validateLogin(user, pass) {
    if (!user || user.trim().length === 0)
        return 'Utilizatorul este obligatoriu.';
    if (!pass || pass.trim().length === 0)
        return 'Parola este obligatorie.';
    return null;
}

app.get('/chestionar', (req, res) => {
    fs.readFile('intrebari.json', (err, data) => {
        if (err) {
            res.status(500).send('Eroare la citirea intrebarilor');
            return;
        }
        const listaIntrebari = JSON.parse(data);
        res.render('chestionar', { intrebari: listaIntrebari });
    });
});

app.get('/admin', requireAdmin, (req, res) => {
    res.render('admin');
});

app.post('/admin/adaugare-produs', requireAdmin, validateCsrf, (req, res) => {
    const db = new Database('cumparaturi.db');
    db.prepare('INSERT INTO fruits (name, price) VALUES (?, ?)').run(req.body.name, parseFloat(req.body.price));
    db.close();
    res.redirect('/admin');
});

app.get('/autentificare', (req, res) => {
    res.render('autentificare', { mesajEroare: req.cookies.mesajEroare })
    res.clearCookie('mesajEroare');
});

app.post('/verificare-autentificare', checkLoginRateLimit, (req, res) => {
    const eroare = validateLogin(req.body.user, req.body.pass);
    if (eroare) {
        res.cookie('mesajEroare', eroare);
        return res.redirect('/autentificare');
    }

    const userSanitized = sanitize(req.body.user);
    const utilizator = utilizatori.find(u => u.utilizator === userSanitized);

    if (utilizator && bcrypt.compareSync(req.body.pass, utilizator.parola)) {
        loginAttempts.delete(req.ip);
        req.session.user = {
            utilizator: utilizator.utilizator,
            rol: utilizator.rol,
            nume: utilizator.nume,
            prenume: utilizator.prenume
        };
        res.redirect('/');
    } else {
        const attempts = loginAttempts.get(req.ip) || { count: 0, blockedUntil: 0, cooldown: 15 * 60 * 1000 };
        attempts.count++;
        if (attempts.count >= 5) {
            attempts.blockedUntil = Date.now() + attempts.cooldown;
            attempts.cooldown *= 2;
            attempts.count = 0;
        }
        loginAttempts.set(req.ip, attempts);
        res.cookie('mesajEroare', 'Utilizator sau parola incorecte!');
        res.redirect('/autentificare');
    }
});

app.get('/delogare', (req, res) => {
    req.session.destroy();
    res.redirect('/');
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

app.get('/creare-bd', (req, res) => {
    const db = new Database('cumparaturi.db');
    db.prepare(`
          CREATE TABLE IF NOT EXISTS fruits (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              price REAL NOT NULL
          )
      `).run();
    db.close();
    res.redirect('/');
});

app.get('/inserare-bd', (req, res) => {
    const db = new Database('cumparaturi.db');
    const count = db.prepare('SELECT COUNT(*) as cnt FROM fruits').get();
    if (count.cnt === 0) {
        const insert = db.prepare('INSERT INTO fruits (name, price) VALUES (@name, @price)');
        const insertMany = db.transaction((fruits) => {
            for (const fruit of fruits)
                insert.run(fruit);
        });

        insertMany([
            { name: 'Banana', price: 2 },
            { name: 'Apple', price: 1 },
            { name: 'Strawberry', price: 3 },
        ]);
    }

    db.close();
    res.redirect('/');
});

app.post('/adaugare-cos', validateCsrf, (req, res) => {
    const id = parseInt(req.body.id);
    if (!req.session.cos)
        req.session.cos = [];
    req.session.cos.push(id);
    res.redirect('/');
})

app.get('/vizualizare-cos', (req, res) => {
    const cos = req.session.cos || [];
    const db = new Database('cumparaturi.db');
    const cantitati = {};
    cos.forEach(id => cantitati[id] = (cantitati[id] || 0) + 1);
    const produse = Object.entries(cantitati).map(([id, cant]) => {
        const produs = db.prepare('SELECT * FROM fruits WHERE id = ?').get(id);
        return { ...produs, cantitate: cant };
    });
    db.close();
    res.render('vizualizare-cos', { produse });
});

app.use((req, res) => {
    const ip = req.ip;
    const now = Date.now();
    const data = notFoundAttempts.get(ip) || { count: 0, blockedUntil: 0, firstAttempt: now };

    if (data.blockedUntil > now) {
        return res.status(403).send('403 Forbidden - IP blocat temporar');
    }

    if (now - data.firstAttempt > 60000) {
        data.count = 0;
        data.firstAttempt = now;
    }

    data.count++;
    if (data.count > 10) {
        data.blockedUntil = Date.now() + 10 * 60 * 1000;
        notFoundAttempts.set(ip, data);
        return res.status(403).send('403 Forbidden - IP blocat temporar');
    }

    notFoundAttempts.set(ip, data);
    res.status(404).send('404 Not Found');
});

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:${port}/`));