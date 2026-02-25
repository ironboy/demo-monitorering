// special routes
// not within the automatic REST api
// because of special checks etc
// (added as a instance method to the class in RestApiSQL,
//  so we can use the properties from that class here)

function getOrderSummarySelect(req) {
  return `SELECT * FROM (SELECT id, created, productId, JSON_EXTRACT(productName, '$.${req.lang}')
    AS productName, quantity, productPrice$, rowSum$, orderLineId FROM orderRowSums
    WHERE id = :orderId
    UNION
    SELECT *, null FROM orderTotals
    WHERE id = :orderId)
    ORDER BY id, CASE WHEN productPrice$ IS NOT NULL THEN 0 ELSE 1 END, orderLineId
  `;
}

export default function addSpecialRoutes() {

  this.app.post(this.prefix + 'change-product-in-cart', async (req, res) => {

    updateOrderWithUserId(req);

    let { productId, quantity, add } = req.body || {};

    // check that the body contains productId and quantity
    if (typeof productId !== 'number' || typeof quantity !== 'number' || productId < 1) {
      res.json({ error: 'The request body must contain productId and quantity as numbers!' });
      return;
    }

    // assume the 'cart' is an order matching the session id or user id
    // and not paid
    // - check if it exists if not then create it
    // the goal is to get the order id for the users cart
    const sessionId = req.sessionID;
    const userId = req.session.user ? req.session.user.id : null;
    let orderId = (await this.db.query('', '',
      'SELECT id FROM orders WHERE paid IS NULL AND (sessionId = :sessionId OR userId = :userId) ORDER BY userId DESC LIMIT 1',
      { sessionId, userId }
    ))[0]?.id;
    if (!orderId) {
      orderId = (await this.db.query('', '',
        'INSERT INTO orders (sessionId, userId) VALUES (:sessionId, :userId)',
        { sessionId, userId }
      )).lastInsertRowid;
      // todo: note MySQL probably returns the new id differently
      // for now this only works with SQLite!
    }

    // check if an order line with the product exists
    let orderLine = (await this.db.query('', '',
      'SELECT * FROM orderLines WHERE orderId = :orderId AND productId = :productId ',
      { orderId, productId }
    ))[0];

    // if the line exists and body.add === true then calculate new quantity
    // (add works as - add/subtract if negative from existinig quantity)
    if (add && orderLine) {
      quantity = orderLine.quantity + quantity;
    }

    // quantity can never be lower than 0
    if (quantity < 0) { quantity = 0; }

    // if the line exists change to quantity or delete if quantity 0
    if (orderLine) {
      if (quantity > 0) {
        (await this.db.query('', '',
          'UPDATE orderLines SET quantity = :quantity WHERE id = :id ',
          { quantity, id: orderLine.id }
        ));
      }
      else {
        (await this.db.query('', '',
          'DELETE FROM orderLines WHERE id = :id',
          { id: orderLine.id }
        ));
      }
    }
    // if the line does not exist then create it if the quantity > 0
    else if (quantity > 0) {
      (await this.db.query('', '',
        'INSERT INTO orderLines (orderId, productId, quantity) VALUES (:orderId, :productId, :quantity)',
        { orderId, productId, quantity }
      ));
    }

    // return the order / "cart"
    const cart = (await this.db.query('', '',
      getOrderSummarySelect(req),
      { orderId }
    ));

    if (cart.length === 0) {
      res.json({ status: 'The cart is empty.' });
    }
    else {
      res.json(cart);
    }

  });

  // return the cart
  this.app.get('/api/cart', async (req, res) => {
    updateOrderWithUserId(req);
    const sessionId = req.sessionID;
    const userId = req.session.user ? req.session.user.id : null;
    // assume the 'cart' is an order matching the session id or user id
    // and not paid- check if it exists
    let orderId = (await this.db.query('', '',
      'SELECT id FROM orders WHERE paid IS NULL AND (sessionId = :sessionId OR userId = :userId)',
      { sessionId, userId }
    ))[0]?.id;
    if (!orderId) {
      res.json({ status: 'The cart is empty.' });
    }
    else {
      // return the order / "cart"
      const cart = (await this.db.query('', '',
        getOrderSummarySelect(req),
        { orderId }
      ));
      if (cart.length === 0) {
        res.json({ status: 'The cart is empty.' });
      }
      else {
        res.json(cart);
      }
    }
  });

  // empty the cart (delete all orderLines in the cart)
  this.app.delete('/api/cart', async (req, res) => {
    updateOrderWithUserId(req);
    const sessionId = req.sessionID;
    const userId = req.session.user ? req.session.user.id : null;
    // assume the 'cart' is an order matching the session id or user id
    // and not paid- check if it exists
    let orderId = (await this.db.query('', '',
      'SELECT id FROM orders WHERE paid IS NULL AND (sessionId = :sessionId OR userId = :userId)',
      { sessionId, userId }
    ))[0]?.id;
    if (orderId) {
      await this.db.query(req.method, req.url,
        'DELETE FROM orderLines WHERE orderId = :orderId ',
        { orderId }
      );
    }
    res.json({ status: 'The cart is empty.' });
  });

  // currency exchange rates (usd base)
  this.app.get('/api/exchange-rates', async (_req, res) => {
    let filterTo = ['nok', 'sek'];
    let all = await (await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json')).json();
    for (let key in all.usd) {
      filterTo.includes(key) || delete all.usd[key];
    }
    res.json(all);
  });

}

// update orders with user id if we have a logged in user
// and orders with no userId but matching sessionId
async function updateOrderWithUserId(req) {
  const sessionId = req.sessionID;
  const userId = req.session.user ? req.session.user.id : null;
  if (sessionId && userId) {
    await this.db.query(req.method, req.url,
      'UPDATE orders SET userId = :userId WHERE userId IS NULL AND sessionId = :sessionId',
      { sessionId, userId }
    );
  }
}