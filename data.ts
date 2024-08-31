interface UserData {
  userData: {
    name: string;
  };
  bio: string;
  profileImage: {
    src: string;
    alt: string;
    class: string;
  };
  headerName: {
    type: string;
    level: number;
    text: string;
    id: string;
  };
  socialLinks: {
    tag: string;
    props: { class: string };
    children: Array<{
      tag: string;
      props: { href: string };
      content: string;
    }>;
  };
  githubLink: {
    type: string;
    href: string;
    text: string;
    title: string;
  };
  projects: Array<{
    name: string;
    description: string;
    url: string;
    technologies: string[];
  }>;
}

export async function fetchUserData(userId: string): Promise<UserData> {
  // Simulate an asynchronous operation
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    userData: {
      name: userId === '1' ? 'John Doe' : 'Jane Doe',
    },
    bio: 'Web developer and TypeScript enthusiast',
    profileImage: {
      src: 'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?q=80&w=1856&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      alt: 'user image',
      class: 'profile-image',
    },
    headerName: {
      type: 'header',
      level: 1,
      text: 'John Doe',
      id: 'profile-name',
    },
    socialLinks: {
      tag: 'div',
      props: { class: 'social-links' },
      children: [
        {
          tag: 'a',
          props: { href: 'https://twitter.com/johndoe' },
          content: 'Twitter',
        },
        {
          tag: 'a',
          props: { href: 'https://github.com/johndoe' },
          content: 'GitHub',
        },
      ],
    },
    githubLink: {
      type: 'link',
      href: 'https://github.com/johndoe',
      text: 'Check out my GitHub',
      title: "John Doe's GitHub Profile",
    },
    projects: [
      {
        name: 'TypeScript Task Manager',
        description:
          'A command-line task management tool built with TypeScript',
        url: 'https://github.com/janesmith/ts-task-manager',
        technologies: ['Node.js', 'TypeScript', 'Commander.js'],
      },
      {
        name: 'React Weather App',
        description: 'A weather application using React and OpenWeatherMap API',
        url: 'https://weather.janesmith.dev',
        technologies: ['React', 'JavaScript', 'OpenWeatherMap API'],
      },
      {
        name: 'Express Blog API',
        description:
          'RESTful API for a blog application built with Express and MongoDB',
        url: 'https://github.com/janesmith/express-blog-api',
        technologies: ['Express.js', 'MongoDB', 'Node.js'],
      },
    ],
  };
}
