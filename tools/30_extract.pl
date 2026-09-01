#!/usr/bin/perl
# 30_extract.pl — 게시글/협약/팝업 데이터 추출 → data/*.js
use strict; use warnings;
use File::Basename qw(dirname);
use File::Path qw(make_path);

my $ROOT = dirname(dirname(__FILE__));
my $RAW  = "$ROOT/_workdir/raw";
my $MAP  = "$ROOT/_workdir/asset_map.tsv";
make_path("$ROOT/data/boards");

my %map;
open my $mf, '<', $MAP or die "asset_map 없음";
while (<$mf>) { chomp; my ($u,$l) = split /\t/; $map{$u} = $l if $u && $l; }
close $mf;

sub localize { # cdn URL → 로컬 경로(접두어 없음). 미등록이면 원본 유지 + 경고
  my ($s, $warn) = @_;
  $s =~ s{(https?://(?:vendor-cdn|cdn|cdn-optimized)\.imweb\.me/[^"'()<>\s\\&]+?)(\?[0-9]+)?(?=["'()<>\s\\&]|$)}{
    exists $map{$1} ? $map{$1} : do { push @$warn, $1; $1 } }ge;
  return $s;
}
sub slurp { my $f = shift; open my $fh,'<:raw',$f or die "$f: $!"; local $/; my $s=<$fh>; close $fh; $s }
sub jstr { my $s = shift; $s =~ s/\\/\\\\/g; $s =~ s/"/\\"/g; $s =~ s/\r//g; $s =~ s/\n/\\n/g; $s =~ s{</script}{<\\/script}gi; qq{"$s"} }

my @warns;

# ---------- 1) 게시판 ----------
my %BOARD_TITLES = (
  86=>'슬림네이트', 104=>'비교정 스마일라인치료', 105=>'치아교정', 106=>'앞니 재생복구치료',
  121=>'깨진 앞니 치료', 107=>'앞니 공간치료', 108=>'앞니 충치치료', 109=>'앞니 올세라믹',
  110=>'치아미백', 111=>'치아성형/잇몸성형',
  112=>'전체 임플란트', 113=>'임플란트 복합치료', 114=>'원데이 임플란트', 115=>'앞니 심미 임플란트',
  116=>'상악동거상술 임플란트', 117=>'뼈재생 임플란트', 118=>'신경관 가까운 임플란트', 119=>'임플란트 틀니',
);

my $total_posts = 0;
for my $b (sort { $a <=> $b } keys %BOARD_TITLES) {
  my $list = slurp("$RAW/pages/$b.html");
  # 카드 순서대로 idx + 썸네일
  my (@order, %thumb);
  while ($list =~ m{<div class="ma-item _post_item_wrap(?:(?!_post_item_wrap).)*?idx=(\d+)(?:(?!_post_item_wrap).)*?}gs) {
    my $blk = $&; my $idx = $1;
    next if grep { $_ eq $idx } @order;
    push @order, $idx;
    if ($blk =~ m{background-image:\s*url\(([^)]+)\)} || $blk =~ m{data-bg=["']url\(([^)]+)\)["']}) {
      my $t = $1; $t =~ s/^['"]|['"]$//g; $t =~ s/\?[0-9]+$//;
      $thumb{$idx} = exists $map{$t} ? $map{$t} : $t;
      push @warns, $t unless exists $map{$t};
    }
  }
  my @entries;
  for my $idx (@order) {
    my $pf = "$RAW/posts/$b-$idx.html";
    unless (-f $pf) { warn "누락 게시글 $b-$idx\n"; next; }
    my $p = slurp($pf);
    my ($title) = $p =~ m{<h1 class=["']view_tit["']>\s*(.*?)\s*</h1>}s;
    $title //= ''; $title =~ s/<[^>]+>//g; $title =~ s/\s+/ /g; $title =~ s/^\s+|\s+$//g;
    # 본문: board_txt_area fr-view 컨테이너 ~ (file_area | comment_section | list_tap | table_bottom) 직전, 끝의 잉여 </div> 제거
    my ($body) = $p =~ m{<div class=["']board_txt_area fr-view["']>\s*(.*?)(?=<div[^>]*class=["'][^"']*(?:file_area|comment_section|list_tap|table_bottom))}s;
    $body =~ s/(\s*<\/div>\s*)+\s*$//s if defined $body;
    unless (defined $body) { warn "본문 추출 실패 $b-$idx\n"; next; }
    $body = localize($body, \@warns);
    $body =~ s/^\s+|\s+$//gs;
    push @entries, { idx=>$idx, title=>$title, thumb=>($thumb{$idx}//''), body=>$body };
  }
  $total_posts += scalar @entries;
  my $out = "$ROOT/data/boards/$b.js";
  open my $of, '>:raw', $out or die $!;
  print $of "window.__BOARDS = window.__BOARDS || {};\n";
  print $of "window.__BOARDS[\"$b\"] = {\n  \"boardId\": \"$b\",\n  \"title\": ".jstr($BOARD_TITLES{$b}).",\n  \"posts\": [\n";
  print $of join(",\n", map {
    "    {\"idx\": \"$$_{idx}\", \"title\": ".jstr($$_{title}).", \"thumb\": ".jstr($$_{thumb}).", \"bodyHtml\": ".jstr($$_{body})."}"
  } @entries);
  print $of "\n  ]\n};\n";
  close $of;
  printf "board %-4s posts:%d (목록 카드:%d)\n", $b, scalar @entries, scalar @order;
}

# ---------- 2) 협약 (/41) ----------
my $p41 = slurp("$RAW/pages/41.html");
sub gallery_items {
  my ($html, $wid) = @_;
  # 컨테이너 시작 위치에서 연속된 _item 블록만 앵커드 매칭 (다음 위젯 침범 방지)
  return () unless $html =~ m{id="container_\Q$wid\E"[^>]*>}g;
  my @items;
  while ($html =~ m{\G\s*<div class="_item item_gallary.*?slide_overlay"></div></div>\s*</div>}gcs) {
    my $it = $&;
    my ($name) = $it =~ m{<h4[^>]*>(.*?)</h4>}s; my ($desc) = $it =~ m{<p[^>]*>(.*?)</p>}s;
    my ($img)  = $it =~ m{background-image:\s*url\(([^)]+)\)}s;
    ($img) = $it =~ m{data-bg="url\(([^)]+)\)"}s unless $img;   # lazyload 미적용(숨김) 항목
    ($img) = $it =~ m{data-src="([^"]+)"}s unless $img;
    next unless $img;
    for ($name, $desc) { $_ //= ''; s/<[^>]+>//g; s/\s+/ /g; s/^\s+|\s+$//g; }
    $img =~ s/^['"]|['"]$//g; $img =~ s/\?[0-9]+$//;
    my $l = exists $map{$img} ? $map{$img} : do { push @warns, $img; $img };
    push @items, { name=>$name, desc=>$desc, logo=>$l };
  }
  return @items;
}
my @featured = gallery_items($p41, 'w202508223f871e2f419b5');
my @logos    = gallery_items($p41, 'w20250822652e11a08595f');
open my $pf, '>:raw', "$ROOT/data/partners.js" or die $!;
print $pf "window.__PARTNERS = {\n  \"targets\": {\n    \"featured\": [\"w202508223f871e2f419b5\",\"w20250903b4d509533c22f\"],\n    \"logos\": [\"w20250822652e11a08595f\",\"w2025090303ed2b84c6a04\"]\n  },\n";
print $pf "  \"featured\": [\n".join(",\n", map { "    {\"name\": ".jstr($$_{name}).", \"desc\": ".jstr($$_{desc}).", \"logo\": ".jstr($$_{logo})."}" } @featured)."\n  ],\n";
print $pf "  \"logos\": [\n".join(",\n", map { "    {\"name\": ".jstr($$_{name}).", \"logo\": ".jstr($$_{logo})."}" } @logos)."\n  ]\n};\n";
close $pf;
printf "partners: featured=%d logos=%d\n", scalar @featured, scalar @logos;

# ---------- 3) 팝업 ----------
my $home = slurp("$RAW/pages/__home.html");
my @pops;
while ($home =~ m{<div id="popup_(S[0-9a-z_]+)" class="pop-container.*?<img class="" src="([^"]+)"[^>]*style="\s*width:(\d+)px".*?(?=<div id="popup_|</div>\s*<style>)}gs) {
  my ($pid, $img, $w) = ($1, $2, $3);
  my $blk = $&;
  my ($left) = $blk =~ m{left:(\d+)px}; my ($top) = $blk =~ m{top:(\d+)px};
  $img =~ s/\?[0-9]+$//;
  my $l = exists $map{$img} ? $map{$img} : do { push @warns, $img; $img };
  push @pops, sprintf('  {"id": "%s", "image": %s, "link": "", "width": %d, "left": %d, "top": %d, "start": "2020-01-01", "end": "2099-12-31", "enabled": true, "hideDays": 1}',
    $pid, jstr($l), $w, $left//550, $top//100);
}
open my $pop, '>:raw', "$ROOT/data/popups.js" or die $!;
print $pop "window.__POPUPS = [\n".join(",\n", @pops)."\n];\n";
close $pop;
printf "popups: %d\n", scalar @pops;

# ---------- 4) config / overrides 초기값 ----------
unless (-f "$ROOT/data/config.js") {
  open my $cf, '>:raw', "$ROOT/data/config.js" or die $!;
  print $cf qq{window.__CONFIG = {\n  "siteName": "광주 마인드원치과의원",\n  "inquiryEmail": "minddent\@naver.com",\n  "formspreeEndpoint": ""\n};\n};
  close $cf;
}
unless (-f "$ROOT/data/overrides.js") {
  open my $ov, '>:raw', "$ROOT/data/overrides.js" or die $!;
  print $ov "window.__OVERRIDES = {};\n";
  close $ov;
}

print "총 게시글: $total_posts\n";
if (@warns) { my %u; my @uw = grep { !$u{$_}++ } @warns; print "경고(미등록 에셋 ".scalar(@uw)."건):\n  ".join("\n  ", @uw[0..($#uw>19?19:$#uw)])."\n"; }
else { print "미등록 에셋 없음\n"; }