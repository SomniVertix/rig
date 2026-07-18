A collection of features that I want to think through for the Rig application:



---
A feature separate from the rig itself 

.DIY Standard 

This standard is going to be a set of Markdown files and general documentation that will serve as a jumping-off point for someone if they want to build the product that this.DIY folder and documentation is in. For example, if we have the.DIY folder in the open-source Kubernetes repo, users would pull this down and use it to spin off a session for building their own kubernetes

What I want to outline here is that the DIY standard is meant to be something that users can jump off from, not just general documentation about the application and then they point it at an AI and have it build it. I want it to be a real walkthrough of this. For context, think of something like Matthew Pocock's "Teach Me" skill or his "Grill Me" skill.

This should include things that are interactive for the user. This should be a real session that happens. It should go over any design decisions that were made during the development process of the proper application. It should also look for any ADR files that are in the repo and see if any of those are decisions that the user may want to change.

A good example of this is if, in the proper application, the database design was initially using MongoDB. A question that should be asked is what database the user wants the application to be configured for, not meaning just the general connection string, but truly meaning the user can switch from a MongoDB to a Postgres in their own way. 

Maybe another way to think about it is a very guided wayfinder session that gives the user the power to make architectural changes or deployment changes, or really anything that they want to change about the product to suit their use case better. 