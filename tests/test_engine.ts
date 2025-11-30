import Knob from '../src/knob';
import JigSaw from '../src/jigsaw';

// Mock JigSaw.getComponent since we are testing Knob in isolation or we can use JigSaw.
// Let's use Knob directly for unit testing the engine.

const template = `
<h1>{{ title }}</h1>
{% if showDescription %}
  <p>{{ description }}</p>
{% else %}
  <p>No description</p>
{% endif %}

<ul>
{% for user in users %}
  <li>{{ user.name }} {% if user.isAdmin %}(Admin){% endif %}</li>
{% endfor %}
</ul>
`;

const data = {
  title: 'Hello World',
  showDescription: true,
  description: 'This is a test description.',
  users: [
    { name: 'Alice', isAdmin: true },
    { name: 'Bob', isAdmin: false },
  ],
};

try {
  console.log('Testing Knob with AST engine...');
  const knob = new Knob(template);
  const result = knob.render(data);
  console.log('Render Result:');
  console.log(result);
  
  if (result.includes('Alice (Admin)') && result.includes('Bob') && !result.includes('Bob (Admin)')) {
      console.log('SUCCESS: Rendered correctly.');
  } else {
      console.error('FAILURE: Render output incorrect.');
  }

} catch (e) {
  console.error('Error during render:', e);
}
