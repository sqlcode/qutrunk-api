BB_KEY=Bitbucket_Access_key_here
BB_USER=Bitbucket_login_user_here

PANEL_REPO=qutrunk_panel

BRANCH=master

#download packages
curl -L https://$BB_USER:$BB_KEY@api.bitbucket.org/2.0/repositories/posinsk/$PANEL_REPO/downloads/$BRANCH-latest.zip > $PANEL_REPO.zip

#remove old backups
rm -rf $PANEL_REPO_old;

#make backup copies
mv /var/www/$PANEL_REPO $PANEL_REPO_old;

#unzip to directories
mkdir -p $PANEL_REPO

unzip -qo $PANEL_REPO.zip -d $PANEL_REPO;

#move panel to webserver dir
rm -rf /var/www/$PANEL_REPO;
mv $PANEL_REPO /var/www;