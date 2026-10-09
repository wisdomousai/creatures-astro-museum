---
title: Title
summary: One sentence for the label beside it, and the card.
url: https://example.com # optional: with no body below, the exhibit leads here
order: 100 # lower hangs first along the wing
role: ''
period: ''
stack: []
cover: ../../assets/projects/lorem.jpg # the picture in the frame
draft: true
# How it shows in the museum, all optional:
exhibit:
  template: framed-picture # triptych, video-wall, plaque, plinth-object…
  size: m # s, m or l
  video: /museum/lorem.mp4 # from public/: a 6 s muted loop, played in the frame
  film: /museum/lorem-film.mp4 # the whole film, with sound: the Watch button plays it
  room: false # true: a room of its own off the hall, hung with the gallery; or a place:
  # jungle, forest, aquarium, snow, village or alps (each its own size, with its view and
  # who lives there), or the zoo's: cat-cafe, dog-park, aviary or robot-park
  gallery: [] # more pictures (../../assets/projects/…), for a room or a triptych
  # model: /museum/teapot.glb # for a plinth-object
  hidden: false # true leaves it out of the museum (the page stays)
---

Write a body and the project gets a page of its own. In .mdx, `<Film src="/museum/lorem-film.mp4" />`
shows a film in the museum's player.
