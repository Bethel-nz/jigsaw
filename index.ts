import { fetchUserData, fetchProfiles } from './data';

import JigSaw from './src/jigsaw';

const jigsaw = JigSaw;

jigsaw.template(['index', 'profiles', 'profile_-id']);

jigsaw.route('/profiles', async () => {
  const profiles = await fetchProfiles();
  return jigsaw.render('profiles', { profiles });
});

jigsaw.route('/profile/:id', async (params) => {
  const data = await fetchUserData(params?.id!);
  return jigsaw.render('profile_-id', data);
});

jigsaw.route('/', (params) => {
  return JigSaw.render('index', { title: 'Welcome' });
});

jigsaw.serve({ port: 8750 });
