const express = require('express');
const router = express.Router();
const passport = require('passport')
const GitHubStrategy = require('passport-github').Strategy;
const BitbucketStrategy = require('passport-bitbucket-oauth2').Strategy;
const config = require('../config.js')
const jwt = require('jsonwebtoken');

const User = require('../models/user')

var login = function(user, req, res) {
    var u = {
        id: user._id
    }

    var token = jwt.sign(u, req.app.get('jwtSecret'), {
        expiresIn: 3600 * 24 * 365 * 10
    });

    res.cookie('x-access-token', token)
    req.decoded = u

    return token
}


let getUserGithub = (profile, accessToken, refreshToken) => {
    return new Promise(async (resolve, reject) => {
        let u = await User.findOne({ github_id: profile.id })

        if (u) {
            return resolve(u)
        }

        u = new User
        //@todo save access token & refresh token
        u.github_id = profile.id
        u.github_access_token = accessToken
        u.name = profile.username
        u.quota.setFreeQuota()

        await u.save()

        resolve(u)
    })
}

let getUserBitbucket = (profile, accessToken, refreshToken) => {
    return new Promise(async (resolve, reject) => {
        let u = await User.findOne({ bitbucket_id: profile.id })

        if (u) {
            return resolve(u)
        }

        u = new User
        //@todo save access token & refresh token
        u.bitbucket_id = profile.id
        u.bitbucket_access_token = accessToken
        u.name = profile.username
        u.quota.setFreeQuota()

        await u.save()

        resolve(u)
    })
}
if (config.github_app_id) {
    passport.use(new GitHubStrategy({
            clientID: config.github_app_id,
            clientSecret: config.github_secret,
            callbackURL: config.api_address + "/api/v1/auth/github/callback"
        },
        function(accessToken, refreshToken, profile, cb) {
            getUserGithub(profile).then(u => {
                cb(null, u)
            })
        }
    ));

    router.route('/github').get(passport.authenticate('github'));
    router.route('/github/callback').get(
        passport.authenticate('github', { failureRedirect: '/login' }),
        function(req, res) {

            if (req.user) {
                let t = login(req.user, req, res)
                return res.redirect(config.panel_address)
            }
        });
}

if (config.bitbucket_app_id) {

    passport.use(new BitbucketStrategy({
            clientID: config.bitbucket_app_id,
            clientSecret: config.bitbucket_secret,
            callbackURL: config.api_address + "/api/v1/auth/bitbucket/callback"
        },
        function(accessToken, refreshToken, profile, cb) {
            getUserBitbucket(profile).then(u => {
                cb(null, u)
            })
        }
    ));
    router.route('/bitbucket').get(passport.authenticate('bitbucket'));
    router.route('/bitbucket/callback').get(passport.authenticate('bitbucket', { failureRedirect: '/login' }),
        function(req, res) {

            if (req.user) {
                let t = login(req.user, req, res)
                return res.redirect(config.panel_address)
            }
        });
}

module.exports = router