#!/bin/sh
# The starter's placeholder pictures and films, made by ffmpeg's own generators (nothing
# to license): a 6 s muted loop for a frame (exhibit.video), its still as the cover, and
# one longer film with sound for the player (exhibit.film). Run from the repo's root:
#   sh scripts/placeholders.sh
set -e
cd "$(dirname "$0")/../starter"
mkdir -p public/museum src/assets/projects

# name | the generator (1280x800, 25 fps)
loops='
lorem|gradients=s=1280x800:c0=0x2f7f86:c1=0xd6aa4c:c2=0xb8403a:c3=0xf3efe6:nb_colors=4:speed=0.04:rate=25
ipsum|life=s=160x100:mold=12:r=25:ratio=0.12:death_color=0xf3efe6:life_color=0x27434d:mold_color=0xd6aa4c,scale=1280:800:flags=neighbor
dolor|gradients=s=1280x800:c0=0x27434d:c1=0xf3efe6:c2=0x2f7f86:c3=0xd6aa4c:nb_colors=4:type=spiral:speed=0.05:rate=25
eiusmod|cellauto=s=320x200:rule=30:rate=25:scroll=1:full=1,scale=1280:800:flags=neighbor,format=rgb24,lutrgb=r=if(gt(val\,128)\,184\,243):g=if(gt(val\,128)\,64\,239):b=if(gt(val\,128)\,58\,230)
'

echo "$loops" | while IFS='|' read -r name source; do
  [ -z "$name" ] && continue
  ffmpeg -nostdin -y -loglevel error -f lavfi -i "$source" -t 6 -an \
    -c:v libx264 -pix_fmt yuv420p -crf 30 -preset slow -movflags +faststart \
    "public/museum/$name.mp4"
  ffmpeg -nostdin -y -loglevel error -ss 3 -i "public/museum/$name.mp4" -frames:v 1 -q:v 3 \
    "src/assets/projects/$name.jpg"
  echo "$name: $(du -h "public/museum/$name.mp4" | cut -f1) loop, cover"
done

# The film: half a minute of the first loop's colours, with a quiet chord under it.
ffmpeg -nostdin -y -loglevel error \
  -f lavfi -i 'gradients=s=1280x800:c0=0x2f7f86:c1=0xd6aa4c:c2=0xb8403a:c3=0xf3efe6:nb_colors=4:speed=0.015:rate=25' \
  -f lavfi -i 'sine=f=196:sample_rate=48000' -f lavfi -i 'sine=f=247:sample_rate=48000' \
  -f lavfi -i 'sine=f=294:sample_rate=48000' \
  -filter_complex '[1][2][3]amix=inputs=3,volume=0.5,afade=t=in:d=2,afade=t=out:st=28:d=2[a];[0]fade=t=in:d=1,fade=t=out:st=29:d=1[v]' \
  -map '[v]' -map '[a]' -t 30 -c:v libx264 -pix_fmt yuv420p -crf 30 -preset slow \
  -c:a aac -b:a 96k -movflags +faststart public/museum/lorem-film.mp4
echo "lorem-film: $(du -h public/museum/lorem-film.mp4 | cut -f1)"
