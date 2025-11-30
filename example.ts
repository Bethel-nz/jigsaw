import JigSaw from './src/jigsaw';
import Knob from './src/knob';

// Define some custom pipes
JigSaw.definePipe('upper', (val: any) => String(val).toUpperCase());
JigSaw.definePipe('lower', (val: any) => String(val).toLowerCase());
JigSaw.definePipe('truncate', (val: any, length: number = 50) => {
  const str = String(val);
  return str.length > length ? str.slice(0, length) + '...' : str;
});
JigSaw.definePipe('currency', (val: number) => `$${val.toFixed(2)}`);

// Example: E-commerce product listing
const productTemplate = `
<div class="product-list">
  <h1>{{ title |> upper }}</h1>
  
  {# Calculate total items #}
  <p>Total Products: {{ products.length }}</p>
  
  {% for product in products %}
    <div class="product-card">
      <h3>{{ product.name }}</h3>
      <p class="price">{{ product.price |> currency }}</p>
      <p class="description">{{ product.description |> truncate }}</p>
      
      {# Show discount badge if applicable #}
      {% if product.discount > 0 %}
        <span class="badge">{{ product.discount }}% OFF</span>
      {% endif %}
      
      {# Show stock status #}
      {% if product.stock > 10 %}
        <span class="stock in">In Stock</span>
      {% else %}
        <span class="stock low">Only {{ product.stock }} left!</span>
      {% endif %}
      
      <p class="item-number">Item #{{ product_index + 1 }}</p>
    </div>
  {% endfor %}
  
  {# Show message if no products #}
  {% if products.length == 0 %}
    <p class="empty">No products available.</p>
  {% endif %}
</div>
`;

const products = {
  title: 'Featured Products',
  products: [
    {
      name: 'Wireless Headphones',
      price: 79.99,
      description: 'High-quality wireless headphones with noise cancellation and 30-hour battery life. Perfect for music lovers and professionals.',
      discount: 15,
      stock: 25
    },
    {
      name: 'Smart Watch',
      price: 299.99,
      description: 'Advanced fitness tracking, heart rate monitoring, and smartphone notifications in a sleek design.',
      discount: 0,
      stock: 8
    },
    {
      name: 'USB-C Hub',
      price: 49.99,
      description: 'Multi-port USB-C hub with HDMI, USB 3.0, and SD card reader.',
      discount: 20,
      stock: 50
    }
  ]
};

// Render the template
const knob = new Knob(productTemplate);
const output = knob.render(products);

console.log('=== RENDERED OUTPUT ===\n');
console.log(output);

// Demonstrate caching - second render is instant (no re-compilation)
console.log('\n=== PERFORMANCE TEST ===');
console.time('First render (with compilation)');
new Knob(productTemplate).render(products);
console.timeEnd('First render (with compilation)');

console.time('Second render (cached)');
new Knob(productTemplate).render(products);
console.timeEnd('Second render (cached)');
