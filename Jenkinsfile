pipeline {
  agent any

  environment {
    IMAGE_NAME = 'silencecut-api'
    IMAGE_TAG = 'latest'
    REGISTRY_URL = 'visionugc.fr'
    BLUE_CONTAINER = 'silencecut-api'
  }

  stages {

    stage('Run Tests') {
      steps {
        script {
          docker.image('node:20-alpine').inside('-u root') {
            echo 'Installing dependencies...'
            sh 'apk add --no-cache ffmpeg'
            echo 'Running tests...'
            sh '''
              npm ci
              npm test
            '''
          }
        }
      }
    }

    stage('Build & Push Docker Image') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-registry-creds',
          usernameVariable: 'REGISTRY_USERNAME',
          passwordVariable: 'REGISTRY_PASSWORD'
        )]) {
          script {
            sh ('echo $REGISTRY_PASSWORD | docker login $REGISTRY_URL -u "$REGISTRY_USERNAME" --password-stdin')
            sh ('docker build -t $REGISTRY_URL/$IMAGE_NAME:$IMAGE_TAG .')
            sh ('docker push $REGISTRY_URL/$IMAGE_NAME:$IMAGE_TAG')

          }
        }
      }
    }

    stage('Blue-Green Deploy') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'docker-registry-creds',
            usernameVariable: 'REGISTRY_USERNAME',
            passwordVariable: 'REGISTRY_PASSWORD'
          )
        ]) {
          // Assure que les identifiants sont utilisés pour les commandes Docker
          script {
            def blue = env.BLUE_CONTAINER
            def appName = env.IMAGE_NAME
           
            def APP_VERSION = sh(
                script: "docker run --rm $REGISTRY_URL/$IMAGE_NAME:$IMAGE_TAG node -p \"require('./package.json').version\"",
                returnStdout: true
            ).trim()
           
            def next = "blue"

            echo "Currently live: blue, deploying to: ${next} deployed version ${APP_VERSION}"

            def nextContainer = blue
           

            // Déploie le nouveau conteneur avec les variables d'environnement
            sh """
              docker-compose -f docker-compose.prod.yaml pull ${nextContainer}
              docker-compose -f docker-compose.prod.yaml up -d ${nextContainer}
            """
            sleep 10



            echo "Switched traffic to ${next}"
          }
        }
      }
    }
  }

  post {
    always {
      sh 'docker logout $REGISTRY_URL'
      echo 'Pipeline terminé.'
    }
  }
}
