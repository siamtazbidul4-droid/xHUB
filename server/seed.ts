import bcrypt from 'bcryptjs';
import { db, createObjectId } from './db.js';
import { getAdminEmail, getAdminPassword } from './config/env.js';

export async function seedDatabaseIfEmpty() {
  // If users or categories already exist, do not overwrite
  if (db.users.length > 0 && db.categories.length > 0 && db.videos.length > 0) {
    return;
  }

  console.log('🌱 Seeding initial platform data with realistic creators and long-form videos...');

  // 1. Initial Categories
  const categoriesData = [
    { name: 'All', slug: 'all', description: 'All video categories' },
    { name: 'Technology', slug: 'technology', description: 'Software engineering, AI, robotics, gadgets' },
    { name: 'Documentary', slug: 'documentary', description: 'Deep dives, nature, cinema and historical chronicles' },
    { name: 'Gaming', slug: 'gaming', description: 'Game reviews, playthroughs, esports, mechanics' },
    { name: 'Entertainment', slug: 'entertainment', description: 'Cinema, comedy, storytelling and animated shorts' },
    { name: 'Music', slug: 'music', description: 'Live concerts, album retrospectives, soundtracks' },
    { name: 'Education', slug: 'education', description: 'Science lectures, mathematics, tutorials' },
    { name: 'Sports', slug: 'sports', description: 'Match analyses, highlights, extreme sports' },
    { name: 'Travel', slug: 'travel', description: 'Expeditions, city guides, cultural journeys' },
    { name: 'Fitness', slug: 'fitness', description: 'Strength workouts, conditioning, athletic training' }
  ];

  db.categories.length = 0;
  for (const cat of categoriesData) {
    db.categories.push({
      _id: createObjectId(),
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      videoCount: 0
    });
  }

  // 2. Admin User
  // Credentials are sourced from server-side environment variables. If the
  // operator has not configured an admin identity, we do NOT fabricate a
  // guessed default password (AUD-012/AUD-016): an unconfigured deployment
  // should simply have no seeded administrator, and the /api/admin/login
  // endpoint already returns 503 in that case.
  const adminEmail = getAdminEmail();
  const adminPassword = getAdminPassword();

  if (adminEmail && adminPassword) {
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    const adminUserId = createObjectId();
    const adminChannelId = createObjectId();

    const adminUser = {
      _id: adminUserId,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      name: 'Kinetix Studio',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: 'admin' as const,
      channelId: adminChannelId,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.users.push(adminUser);

    db.channels.push({
      _id: adminChannelId,
      userId: adminUserId,
      name: 'Kinetix Studio',
      handle: '@kinetix_official',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
      description: 'Official flagship channel for Kinetix platform premieres, original productions, and open cinema.',
      subscriberCount: 24800,
      videoCount: 0,
      totalViews: 412900,
      verified: true,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    });
  } else {
    console.warn(
      '[seed] ADMIN_EMAIL/ADMIN_PASSWORD are not configured; skipping administrator seeding. ' +
      'Set both to enable /api/admin/login.'
    );
  }

  // 3. Realistic Creator Channels
  const creators = [
    {
      name: 'Elena Rostova',
      handle: '@elenacinema',
      email: 'elena@kinetix.io',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&auto=format&fit=crop&q=80',
      description: 'Cinematographer and open-source film director. Exploring visual narrative and high-fidelity CGI filmmaking.',
      subscribers: 18200
    },
    {
      name: 'TechPulse Engineering',
      handle: '@techpulse',
      email: 'techpulse@kinetix.io',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
      description: 'Deep architectural breakdowns of cloud infrastructure, distributed databases, and high-throughput video pipelines.',
      subscribers: 43100
    },
    {
      name: 'NatureSphere Expeditions',
      handle: '@naturesphere',
      email: 'nature@kinetix.io',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=80',
      description: 'Wildlife expeditions, ecological explorations, and 4K field recordings across seven continents.',
      subscribers: 59300
    },
    {
      name: 'Apex Gaming Labs',
      handle: '@apexgaming',
      email: 'apex@kinetix.io',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      banner: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&auto=format&fit=crop&q=80',
      description: 'Comprehensive mechanical analyses of competitive titles, speedrun breakdowns, and game engine architecture.',
      subscribers: 31400
    }
  ];

  const creatorEntities: { userId: string; channelId: string; name: string }[] = [];

  for (const c of creators) {
    const uId = createObjectId();
    const chId = createObjectId();
    const pw = await bcrypt.hash('Creator123!', 10);

    db.users.push({
      _id: uId,
      email: c.email,
      passwordHash: pw,
      name: c.name,
      avatar: c.avatar,
      role: 'creator',
      channelId: chId,
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    });

    db.channels.push({
      _id: chId,
      userId: uId,
      name: c.name,
      handle: c.handle,
      avatar: c.avatar,
      banner: c.banner,
      description: c.description,
      subscriberCount: c.subscribers,
      videoCount: 0,
      totalViews: 0,
      verified: true,
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    });

    creatorEntities.push({ userId: uId, channelId: chId, name: c.name });
  }

  // 4. Real, Playable Videos with Real Formats and Real Metadata
  // High reliability public media URLs (Blender Foundation & W3C standard web media streams)
  const seedVideos = [
    {
      title: 'Cosmos Laundromat: First Cycle (Open Movie Project 4K)',
      description: 'On a desolate island, a suicidal sheep named Franck meets a quirky salesman who offers him the gift of a lifetime. A stunning, critically acclaimed animated feature showcasing photorealistic rendering and dynamic hair simulation.\n\nDirected by Mathieu Auvray.\nProduced by Ton Roosendaal / Blender Institute.',
      tags: ['animation', 'cinema', 'blender', '4k', 'cgi', 'cosmos'],
      category: 'Entertainment',
      thumbnailUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      duration: 596, // ~10 minutes
      fileSize: 158000000,
      views: 94820,
      likesCount: 5120,
      featured: true,
      creatorIndex: 0 // Elena Rostova
    },
    {
      title: 'Tears of Steel: Sci-Fi Visual Effects & Compositing Breakdown',
      description: 'Set in a dystopian future Amsterdam, a group of scientists and soldiers attempt to stage a crucial event to save the world from destructive robots. Includes full digital cinematography breakdown and tracking pipeline.\n\nOpen Source VFX project exploring camera mapping and physics engines.',
      tags: ['vfx', 'scifi', 'filmmaking', 'technology', 'cinema'],
      category: 'Technology',
      thumbnailUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      duration: 734, // ~12m 14s
      fileSize: 198400000,
      views: 124500,
      likesCount: 8900,
      featured: true,
      creatorIndex: 1 // TechPulse
    },
    {
      title: 'Wild Fjords & Glaciers: A 4K Alpine Exploration',
      description: 'An expedition across the remote Northern coastlines, dramatic glacial valleys, and pristine arctic waters. Captured over 45 days in sub-zero terrain using stabilized cinema cameras.\n\nTrack: Ambient Field Soundscape in 5.1 Surround.',
      tags: ['nature', 'documentary', 'arctic', 'fjords', 'travel', '4k'],
      category: 'Documentary',
      thumbnailUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      duration: 900, // 15 mins
      fileSize: 220000000,
      views: 81200,
      likesCount: 4320,
      featured: false,
      creatorIndex: 2 // NatureSphere
    },
    {
      title: 'Building Distributed Video Streaming Infrastructure at Scale',
      description: 'In this technical masterclass, we explore the architecture behind scalable adaptive bitrate video delivery: chunked multipart ingestion, object storage partitioning, CDN edge caching, and real-time bandwidth throttling.',
      tags: ['architecture', 'streaming', 'software', 'backend', 'performance'],
      category: 'Technology',
      thumbnailUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      duration: 1840, // 30 mins
      fileSize: 450000000,
      views: 45900,
      likesCount: 3780,
      featured: true,
      creatorIndex: 1 // TechPulse
    },
    {
      title: 'Speedrun Mechanics & Physics Glitches in Modern Game Engines',
      description: 'How frame rate calculation discrepancies, sub-pixel collision clipping, and velocity overflows enable impossible movement in modern 3D games. An in-depth spatial geometry examination.',
      tags: ['gaming', 'speedrun', 'physics', 'gamedev', 'mechanics'],
      category: 'Gaming',
      thumbnailUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      duration: 653, // ~11 mins
      fileSize: 175000000,
      views: 67300,
      likesCount: 4950,
      featured: false,
      creatorIndex: 3 // Apex Gaming
    },
    {
      title: 'Sintel: The Search for the Scales (Full High-Definition Cinematic)',
      description: 'A lonely young woman named Sintel rescues and nurses a wounded baby dragon, forming an unbreakable bond. When an adult dragon abducts her companion, she embarks on a dangerous journey across frozen lands and deadly peaks.',
      tags: ['sintel', 'fantasy', 'animation', 'storytelling', 'cinematic'],
      category: 'Entertainment',
      thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      duration: 888, // 14m 48s
      fileSize: 210000000,
      views: 215000,
      likesCount: 16400,
      featured: true,
      creatorIndex: 0 // Elena
    },
    {
      title: 'Deep Ocean Bioluminescence: Secret Lights of the Twilight Zone',
      description: 'At depths beyond 200 meters, over 75% of marine creatures produce their own illumination. Join our marine biology team as we descend in a deep-sea submersible to film never-before-seen siphonophores and colossal squid.',
      tags: ['ocean', 'bioluminescence', 'science', 'deepsea', 'documentary'],
      category: 'Documentary',
      thumbnailUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4',
      duration: 1205, // 20m 05s
      fileSize: 310000000,
      views: 52100,
      likesCount: 3990,
      featured: false,
      creatorIndex: 2 // NatureSphere
    },
    {
      title: 'High-Altitude Marathon Training: VO2 Max and Altitude Physiology',
      description: 'How elite marathon runners condition cardiovascular capacity and hemoglobin density in thin air at 2,800m elevation. Includes biometric lactate profiling and training regimens.',
      tags: ['fitness', 'athletics', 'endurance', 'marathon', 'physiology'],
      category: 'Fitness',
      thumbnailUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop&q=80',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      duration: 1420, // 23m 40s
      fileSize: 340000000,
      views: 31800,
      likesCount: 2450,
      featured: false,
      creatorIndex: 1 // TechPulse
    }
  ];

  db.videos.length = 0;

  for (let i = 0; i < seedVideos.length; i++) {
    const sv = seedVideos[i];
    const creator = creatorEntities[sv.creatorIndex];
    const vId = createObjectId();
    const createdAt = new Date(Date.now() - (seedVideos.length - i) * 3 * 86400000).toISOString();

    const videoDoc = {
      _id: vId,
      channelId: creator.channelId,
      userId: creator.userId,
      title: sv.title,
      description: sv.description,
      tags: sv.tags,
      category: sv.category,
      thumbnailUrl: sv.thumbnailUrl,
      videoUrl: sv.videoUrl,
      duration: sv.duration,
      fileSize: sv.fileSize,
      visibility: 'public' as const,
      status: 'published' as const,
      views: sv.views,
      likesCount: sv.likesCount,
      commentsCount: 0,
      featured: sv.featured,
      allowDownload: true,
      createdAt,
      updatedAt: createdAt
    };

    db.videos.push(videoDoc);

    // Update channel stats
    const ch = db.channels.find(c => c._id === creator.channelId);
    if (ch) {
      ch.videoCount += 1;
      ch.totalViews += sv.views;
    }

    // Add initial realistic comments
    const comment1Id = createObjectId();
    const commentUser = db.users[0]; // Admin user commenting
    db.comments.push({
      _id: comment1Id,
      videoId: vId,
      userId: commentUser._id,
      channelId: commentUser.channelId!,
      content: 'The production quality and pacing here is genuinely phenomenal. Especially the color grade in the middle act!',
      parentId: null,
      likesCount: 14,
      replyCount: 1,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
    });

    // Add a reply
    db.comments.push({
      _id: createObjectId(),
      videoId: vId,
      userId: creator.userId,
      channelId: creator.channelId,
      content: 'Thank you! We spent over two weeks fine-tuning the dynamic range curves and audio mastering.',
      parentId: comment1Id,
      likesCount: 8,
      replyCount: 0,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
    });

    videoDoc.commentsCount = 2;
  }

  // Update Category counts
  for (const cat of db.categories) {
    if (cat.name === 'All') {
      cat.videoCount = db.videos.length;
    } else {
      cat.videoCount = db.videos.filter(v => v.category.toLowerCase() === cat.name.toLowerCase()).length;
    }
  }

  db.save();
  console.log(`✅ Seeded ${db.categories.length} categories, ${db.users.length} users, and ${db.videos.length} videos.`);
}
