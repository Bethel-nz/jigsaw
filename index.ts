import { fetchUserData } from './data';

import JigSaw from './src/jigsaw';

const jigsaw = JigSaw;

jigsaw.template(['index', 'profile', 'profile:id']); // added param support

jigsaw.route('/profile', async (params) => {
  const data = await fetchUserData('1');
  return jigsaw.render('profile', data);
});

// would break if you just do /profile/2 without /:id
jigsaw.route('/profile/:id', async (params) => {
  const data = await fetchUserData(params?.id!);
  return jigsaw.render('profile', data);
});

jigsaw.route('/', (params) => {
  return JigSaw.render('index', { title: 'Welcome' });
});

jigsaw.serve({ port: 8750 });
