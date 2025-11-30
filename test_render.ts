import JigSaw from './src/jigsaw';

JigSaw.template(['test_meta']);

const result = JigSaw.render('test_meta', { 
  title: 'Hello World',
  user: { name: 'John Doe' }
});

console.log(result.html);
console.log('Meta:', result.meta);
