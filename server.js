const express = require("express");
const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

const app = express();
const PORT = process.env.PORT || 4242;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const DATA = path.join(__dirname, "data", "bookings.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readBookings() {
  try { return JSON.parse(fs.readFileSync(DATA, "utf8")); }
  catch { return []; }
}
function saveBookings(items) {
  fs.writeFileSync(DATA, JSON.stringify(items, null, 2));
}
function makeId() {
  return "FC-" + Date.now().toString(36).toUpperCase();
}

const cars = {
  economy: { name: "Economy", weekly: 350, sell: 400 },
  compact: { name: "Compact", weekly: 420, sell: 470 },
  suv: { name: "SUV", weekly: 520, sell: 570 }
};

app.get("/api/cars", (req, res) => res.json(cars));

app.get("/api/bookings", (req, res) => {
  const items = readBookings().map(b => ({
    id:b.id, name:b.name, email:b.email, start:b.start, end:b.end,
    car:b.car, customerPrice:b.customerPrice, status:b.status, createdAt:b.createdAt
  }));
  res.json(items);
});

app.post("/api/create-checkout", async (req, res) => {
  try {
    const {name, email, start, end, carKey} = req.body;
    if (!name || !email || !start || !end || !cars[carKey])
      return res.status(400).json({error:"Dati incompleti"});

    const car = cars[carKey];
    const id = makeId();
    const booking = {
      id, name, email, start, end, car:car.name,
      partnerCost:car.weekly, customerPrice:car.sell,
      margin:car.sell-car.weekly, status:"pending", createdAt:new Date().toISOString()
    };
    const items = readBookings();
    items.push(booking);
    saveBookings(items);

    if (!stripe)
      return res.json({demo:true, bookingId:id, message:"Stripe non configurato: prenotazione salvata in modalità demo."});

    const session = await stripe.checkout.sessions.create({
      mode:"payment",
      customer_email:email,
      line_items:[{
        quantity:1,
        price_data:{
          currency:"eur",
          product_data:{name:`Fast Car ${car.name}`, description:`Noleggio ${start} - ${end}`},
          unit_amount:car.sell*100
        }
      }],
      metadata:{bookingId:id},
      success_url:`${BASE_URL}/success.html?booking=${id}`,
      cancel_url:`${BASE_URL}/?cancelled=1`
    });

    booking.checkoutSessionId = session.id;
    saveBookings(items);
    res.json({url:session.url, bookingId:id});
  } catch (e) {
    res.status(500).json({error:e.message});
  }
});

app.get("/api/health", (req,res) => res.json({
  ok:true, stripeConfigured:Boolean(stripe), mode: stripe ? "stripe_test_or_live" : "demo"
}));

app.listen(PORT, () => console.log(`Fast Car: ${BASE_URL}`));
