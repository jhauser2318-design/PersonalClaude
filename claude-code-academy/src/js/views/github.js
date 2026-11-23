/* GitHub & Claude: a learning track with the interactive Git Playground. */
(function (C) {
  const MISSION_FOR = {
    why: 'github-flow', daily: 'fix-bug', branches: 'github-flow', issues: 'claude-action', 'claude-git': 'github-flow',
    'gh-cli': 'ci-fix', 'gh-mcp': 'mcp', 'actions-claude': 'claude-action', ci: 'ci-fix', 'repo-ready': 'memory',
  };
  C.register('github', {
    render(host, arg) {
      C.renderTrack(host, arg, {
        route: 'github', title: 'GitHub & Claude', icon: '<span style="font-size:18px">🐙</span>', stateKey: 'github',
        chapters: () => C.GITHUB, missionFor: MISSION_FOR,
        practice: ['github-flow', 'claude-action', 'ci-fix'],
        labs: [{ id: 'play', title: 'Git Playground', icon: '🎮', top: true, render: (body) => C.renderGitPlayground(body) }],
        afterBody: (cur) => (['daily', 'branches', 'why'].includes(cur.id)
          ? '<div class="callout tip"><div class="ci">🎮</div><div><b>Practice this for real:</b> the <a data-ch="play">Git Playground</a> lets you type these commands and watch the commit graph change.</div></div>' : ''),
      });
    },
  });
})(window.CCA);
