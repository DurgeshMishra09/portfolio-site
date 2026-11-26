/**
 * Portfolio data.
 *
 * Everything you can edit lives in `./content.json` (profile, projects, certificates,
 * skills, journey, highlights, intro). The owner editor writes that file, so keep the
 * JSON shape the same. This file only adds types and the fixed layout settings.
 */
import content from './content.json';

export type Palette = { from: string; via: string; to: string; accent: string };
export type Metric = { value: string; label: string };
export type Project = {
  id: string; title: string; year: string; genre: string; logline: string;
  stack: string[]; build: string[]; features: string[]; metrics: Metric[];
  website?: string; github?: string; palette: Palette; motif: 'shield' | 'flow' | 'tenants';
};
export type Achievement = { id: string; title: string; org: string; detail: string; laurel: string; link?: string };
export type Certification = { issuer: string; name: string; link: string };
export type Skill = { name: string; mono: string; note?: string };
export type SkillCategory = { id: string; title: string; subtitle: string; skills: Skill[] };
export type Episode = { code: string; title: string; description: string; tags: string[]; runtime: string; palette: Palette };
export type Season = { number: number; title: string; period: string; synopsis: string; episodes: Episode[] };
export type TopPick = { label: string; title: string; detail: string; palette: Palette };
export type IntroSlide = { kicker: string; title: string; lines: string[]; chips?: string[] };

export const profile = content.profile;
export const education = content.education;
export const experience = content.experience;
export const projects = content.projects as unknown as Project[];
export const achievements = content.achievements as unknown as Achievement[];
// One list to edit: every certificate/achievement also appears in the certifications rail.
export const certifications: Certification[] = achievements.map((a) => ({
  issuer: a.org,
  name: a.title,
  link: a.link ?? '',
}));
export const skillCategories = content.skillCategories as unknown as SkillCategory[];
export const seasons = content.seasons as unknown as Season[];
export const topPicks = content.topPicks as unknown as TopPick[];
export const introSlides = content.introSlides as unknown as IntroSlide[];

const crimson: Palette = { from: '#24060b', via: '#6e0d1d', to: '#09070a', accent: '#ff3d5a' };
const amber: Palette = { from: '#1c1003', via: '#6b3c06', to: '#0a0806', accent: '#ffb547' };
const ocean: Palette = { from: '#04121f', via: '#0f4c6e', to: '#05080d', accent: '#4cc9ff' };
const violet: Palette = { from: '#120822', via: '#3d1a6e', to: '#07060c', accent: '#b98bff' };
const jade: Palette = { from: '#03150f', via: '#0d5a40', to: '#050a08', accent: '#46e3a8' };

export type ProfileId = 'durgesh' | 'recruiter' | 'developer' | 'creative';
export type SectionId = 'about' | 'journey' | 'originals' | 'picks' | 'skills' | 'moments' | 'story';
export const viewerProfiles: { id: ProfileId; name: string; blurb: string; color: string; order: SectionId[] }[] = [
  { id: 'durgesh', name: 'Durgesh', blurb: 'The full portfolio, in order', color: '#e5132b', order: ['about', 'journey', 'originals', 'picks', 'skills', 'moments', 'story'] },
  { id: 'recruiter', name: 'Recruiter', blurb: 'Resume, projects & skills first', color: '#4cc9ff', order: ['story', 'moments', 'skills', 'originals', 'about', 'journey', 'picks'] },
  { id: 'developer', name: 'Developer', blurb: 'Projects, stack & GitHub first', color: '#46e3a8', order: ['originals', 'skills', 'journey', 'moments', 'about', 'picks', 'story'] },
  { id: 'creative', name: 'Creative', blurb: 'The story arc & highlights first', color: '#ffb547', order: ['journey', 'picks', 'originals', 'moments', 'about', 'skills', 'story'] },
];
export const sectionMeta: Record<SectionId, { nav: string; card: string; meta: string; palette: Palette }> = {
  about: { nav: 'About', card: 'About Me', meta: 'The Pilot • Education & training', palette: violet },
  journey: { nav: 'Journey', card: 'My Journey', meta: `${seasons.length} Seasons • ${seasons.reduce((n, s) => n + s.episodes.length, 0)} Episodes`, palette: amber },
  originals: { nav: 'Originals', card: 'My Projects', meta: `${projects.length} Projects`, palette: crimson },
  picks: { nav: 'Top Picks', card: 'Highlights', meta: 'Selected portfolio highlights', palette: jade },
  skills: { nav: 'Skills', card: 'My Skills', meta: `${skillCategories.length} Categories`, palette: ocean },
  moments: { nav: 'Moments', card: 'Certifications', meta: `${achievements.length} Highlights • ${certifications.length} Certifications`, palette: crimson },
  story: { nav: 'Resume', card: 'The Full Story', meta: 'Resume • View & download', palette: violet },
};
